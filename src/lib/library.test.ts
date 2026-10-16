import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnvironment, makeTrack } from "./testing";

beforeEach(freshEnvironment);

async function load() {
  const library = await import("./library");
  const db = await import("./db");
  await library.loadLibrary();
  return { library, db };
}

const art = (id: string) => ({ id, blob: new Blob(["jpeg"]) });

describe("library", () => {
  it("removes songs from playlists and deletes their files", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a"), file: new Blob(["a"]) });
    await library.addTrack({ track: makeTrack("b"), file: new Blob(["b"]) });
    await library.createPlaylist("Mix", ["a", "b", "a"]);
    await library.removeTracks(new Set(["a"]));
    expect(library.getPlaylists()[0].trackIds).toEqual(["b"]);
    expect(await library.storedFile("a")).toBeUndefined();
    expect(await library.storedFile("b")).toBeDefined();
  });

  it("keeps album art until the last song using it is removed", async () => {
    const { library, db } = await load();
    const shared = { album: "Lamplight", artId: "album:x" };
    await library.addTrack({ track: makeTrack("a", shared), art: art("album:x") });
    await library.addTrack({ track: makeTrack("b", shared) });
    await library.removeTracks(new Set(["a"]));
    expect(library.hasArt("album:x")).toBe(true);
    expect(await db.get("art", "album:x")).toBeDefined();
    await library.removeTracks(new Set(["b"]));
    expect(library.hasArt("album:x")).toBe(false);
    expect(await db.get("art", "album:x")).toBeUndefined();
  });

  it("gives earlier songs of an album its cover when a later song brings it", async () => {
    const { library } = await load();
    const albumArt = "album:artist\nlamplight";
    await library.addTrack({ track: makeTrack("a", { album: "Lamplight" }) });
    await library.addTrack({ track: makeTrack("b", { album: "Lamplight", artId: albumArt }), art: art(albumArt) });
    expect(library.getTrack("a")?.artId).toBe(albumArt);
  });

  it("leaves a linked song's file alone when it's removed", async () => {
    const { library } = await load();
    const writes = vi.spyOn(await import("./db"), "write");
    await library.addTrack({ track: makeTrack("a", { source: { kind: "linked", folderId: "f", path: "a.mp3" } }) });
    await library.removeTracks(new Set(["a"]));
    const deletes = writes.mock.calls.at(-1)![0].map((w) => `${w.store}:${w.op}`);
    expect(deletes).toEqual(["tracks:delete"]);
  });
});

describe("savePlaylist", () => {
  it("undoes the change and reports it when the write fails", async () => {
    vi.doMock("./db", async (original) => ({
      ...(await original<typeof import("./db")>()),
      write: vi.fn().mockRejectedValue(new DOMException("Full", "QuotaExceededError")),
    }));
    const library = await import("./library");
    const errors = vi.fn();
    library.onStorageError(errors);
    expect(await library.createPlaylist("Mix")).toBeNull();
    expect(library.getPlaylists()).toEqual([]);
    expect(errors).toHaveBeenCalledWith("Couldn't save the playlist. The change was undone.");
    vi.doUnmock("./db");
  });
});

describe("plays and likes", () => {
  it("keeps both a like and a play count made at the same moment", async () => {
    const { library, db } = await load();
    await library.addTrack({ track: makeTrack("a") });
    await Promise.all([library.toggleLike("a"), library.recordPlay("a")]);
    const saved = await db.get<import("./types").Track>("tracks", "a");
    expect(saved?.likedAt).toBeTypeOf("number");
    expect(saved?.playCount).toBe(1);
    expect(library.getTrack("a")?.playCount).toBe(1);
  });

  it("doesn't bring back a song that's removed while a like or play is waiting to save", async () => {
    const { library, db } = await load();
    await library.addTrack({ track: makeTrack("a"), file: new Blob(["a"]) });
    const removal = library.removeTracks(new Set(["a"]));
    await Promise.all([removal, library.toggleLike("a"), library.recordPlay("a")]);
    expect(await db.get("tracks", "a")).toBeUndefined();
    expect(library.getTrack("a")).toBeUndefined();
  });

  it("skips a copy-in patch for a song removed before its turn", async () => {
    const { library, db } = await load();
    await library.addTrack({ track: makeTrack("a", { source: { kind: "linked", folderId: "f", path: "a.mp3" } }) });
    const removal = library.removeTracks(new Set(["a"]));
    const patched = library.patchTrack("a", { source: { kind: "copied" } }, [{ store: "files", op: "put", key: "a", value: new Blob(["a"]) }]);
    await removal;
    expect(await patched).toBe(false);
    expect(await db.get("tracks", "a")).toBeUndefined();
    expect(await db.get("files", "a")).toBeUndefined();
  });

  it("saves a bulk unlike in one write", async () => {
    const { library } = await load();
    for (const id of ["a", "b", "c"]) await library.addTrack({ track: makeTrack(id, { likedAt: 1 }) });
    const writes = vi.spyOn(await import("./db"), "write");
    await library.setLikes(new Map([["a", undefined], ["b", undefined], ["c", undefined]]));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(["a", "b", "c"].map((id) => library.getTrack(id)?.likedAt)).toEqual([undefined, undefined, undefined]);
  });

  it("puts a like back and reports it when the write fails", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a") });
    const errors = vi.fn();
    library.onStorageError(errors);
    vi.spyOn(await import("./db"), "write").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
    await library.toggleLike("a");
    expect(library.getTrack("a")?.likedAt).toBeUndefined();
    expect(errors).toHaveBeenCalledWith("Couldn't like the song.");
  });
});

describe("groupArtists", () => {
  it("keeps a compilation under one artist and lists songs with no album after the albums", async () => {
    const { groupAlbums, groupArtists } = await import("./library");
    const tracks = [
      makeTrack("hits1", { artist: "Queen", albumArtist: "Various artists", album: "Hits", trackNo: 1 }),
      makeTrack("hits2", { artist: "Blondie", albumArtist: "Various artists", album: "Hits", trackNo: 2 }),
      makeTrack("late", { artist: "Queen", albumArtist: "Queen", album: "Innuendo", year: 1991, trackNo: 1 }),
      makeTrack("early", { artist: "Queen", albumArtist: "Queen", album: "Queen II", year: 1974, trackNo: 1, artId: "album:q2" }),
      makeTrack("loose", { title: "Demo", artist: "Queen", albumArtist: "Queen", album: "" }),
    ];
    const artists = groupArtists(groupAlbums(tracks));
    expect(artists.map((a) => a.name)).toEqual(["Blondie", "Queen", "Various artists"]);
    const [blondie, queen, various] = artists;
    expect(various.albums.map((a) => a.title)).toEqual(["Hits"]);
    expect(various.tracks.map((t) => t.id)).toEqual(["hits1", "hits2"]);
    expect(queen.albums.map((a) => a.title)).toEqual(["Queen II", "Innuendo"]);
    expect(queen.appearsOn.map((a) => a.title)).toEqual(["Hits"]);
    expect(queen.songs.map((t) => t.id)).toEqual(["loose"]);
    expect(queen.tracks.map((t) => t.id)).toEqual(["early", "late", "hits1", "loose"]);
    expect(queen.artId).toBe("album:q2");
    expect(blondie.albums).toEqual([]);
    expect(blondie.appearsOn.map((a) => a.title)).toEqual(["Hits"]);
    expect(blondie.tracks.map((t) => t.id)).toEqual(["hits2"]);
  });

  it("keeps songs with no album apart from an album really called Unknown album", async () => {
    const { groupAlbums, groupArtists } = await import("./library");
    const tracks = [makeTrack("real", { album: "Unknown album" }), makeTrack("untagged", { album: "" })];
    const [artist] = groupArtists(groupAlbums(tracks));
    expect(artist.albums.map((a) => a.tracks.map((t) => t.id))).toEqual([["real"]]);
    expect(artist.songs.map((t) => t.id)).toEqual(["untagged"]);
  });
});

describe("editTracks", () => {
  it("moves an untagged song onto an album and gives it that album's cover", async () => {
    const { library, db } = await load();
    const albumArt = "album:queen\ninnuendo";
    await library.addTrack({ track: makeTrack("a", { artist: "Queen", albumArtist: "Queen", album: "Innuendo", artId: albumArt }), art: art(albumArt) });
    await library.addTrack({ track: makeTrack("b", { artId: "track:b" }), art: art("track:b") });
    expect(await library.editTracks(new Map([["b", { artist: "Queen", albumArtist: "Queen", album: "Innuendo" }]]))).toBe(true);
    expect(library.getTrack("b")?.artId).toBe(albumArt);
    expect(library.groupAlbums(library.getTracks()).find((a) => a.title === "Innuendo")?.tracks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(await db.get("art", "track:b")).toBeUndefined();
    expect((await db.get<import("./types").Track>("tracks", "b"))?.album).toBe("Innuendo");
  });

  it("keeps a song's cover when its new album has none, and leaves the old album's cover to the songs still on it", async () => {
    const { library, db } = await load();
    const old = "album:artist\nlamplight";
    for (const id of ["a", "b"]) await library.addTrack({ track: makeTrack(id, { album: "Lamplight", artId: old }), art: art(old) });
    await library.editTracks(new Map([["a", { album: "Ember" }]]));
    const copy = library.getTrack("a")?.artId;
    expect(copy).toMatch(/^art:/);
    expect(await db.get("art", copy!)).toBeDefined();
    expect(library.getTrack("b")?.artId).toBe(old);
    expect(await db.get("art", old)).toBeDefined();
  });

  it("gives a renamed album its own copy of the cover, so the old name's cover is free for that album", async () => {
    const { library, db } = await load();
    const old = "album:artist\nlamplight";
    for (const id of ["a", "b"]) await library.addTrack({ track: makeTrack(id, { album: "Lamplight", artId: old }), art: art(old) });
    await library.editTracks(new Map(["a", "b"].map((id) => [id, { album: "Ember" }])));
    const copy = library.getTrack("a")?.artId;
    expect(copy).toMatch(/^art:/);
    expect(library.getTrack("b")?.artId).toBe(copy);
    expect(await db.get("art", copy!)).toBeDefined();
    expect(await db.get("art", old)).toBeUndefined();
    expect(library.hasArt(old)).toBe(false);
  });

  it("changes nothing when the save fails", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a") });
    const errors = vi.fn();
    library.onStorageError(errors);
    vi.spyOn(await import("./db"), "write").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
    expect(await library.editTracks(new Map([["a", { title: "New" }]]))).toBe(false);
    expect(library.getTrack("a")?.title).toBe("Song a");
    expect(errors).toHaveBeenCalledWith("Couldn't save the changes. Nothing was changed.");
  });
});

describe("setAlbumArt", () => {
  it("puts one cover on every song of the album and drops covers nothing uses any more", async () => {
    const { library, db } = await load();
    await library.addTrack({ track: makeTrack("a", { album: "Lamplight", artId: "track:a" }), art: art("track:a") });
    await library.addTrack({ track: makeTrack("b", { album: "Lamplight" }) });
    const key = library.trackAlbumKey(library.getTrack("a")!);
    expect(await library.setAlbumArt(key, new Blob(["new"]))).toBe(true);
    const [a, b] = ["a", "b"].map((id) => library.getTrack(id)?.artId);
    expect(a).toMatch(/^art:/);
    expect(b).toBe(a);
    expect(await db.get("art", "track:a")).toBeUndefined();
    expect(await db.get("art", a!)).toBeDefined();
  });
});
