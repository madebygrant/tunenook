import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnvironment, makeTrack, probeHook, readHook } from "./testing";

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
    const albumArt = "album:lamplight";
    await library.addTrack({ track: makeTrack("a", { album: "Lamplight" }) });
    await library.addTrack({ track: makeTrack("b", { album: "Lamplight", artId: albumArt }), art: art(albumArt) });
    expect(library.getTrack("a")?.artId).toBe(albumArt);
  });

  it("counts only the audio it stores toward stored bytes", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a", { size: 100 }) });
    await library.addTrack({ track: makeTrack("b", { size: 50 }) });
    await library.addTrack({ track: makeTrack("c", { size: 999, source: { kind: "linked", folderId: "f", path: "c.mp3" } }) });
    expect(library.storedBytes()).toBe(150);
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

describe("play log", () => {
  it("logs each counted play with its time and keeps it across a reload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a") });
    vi.setSystemTime(1000);
    await library.recordPlay("a");
    vi.setSystemTime(2000);
    await library.recordPlay("a");
    vi.useRealTimers();
    vi.resetModules();
    const reloaded = await load();
    expect(reloaded.library.getPlays().map((p) => [p.trackId, p.at])).toEqual([
      ["a", 1000],
      ["a", 2000],
    ]);
    expect(reloaded.library.getTrack("a")?.playCount).toBe(2);
  });

  it("keeps a removed song's plays and name until its history is cleared", async () => {
    const { library, db } = await load();
    await library.addTrack({ track: makeTrack("a") });
    await library.addTrack({ track: makeTrack("b") });
    await library.recordPlay("a");
    await library.recordPlay("b");
    await library.removeTracks(new Set(["a"]));
    expect(library.getPlays().map((p) => p.trackId)).toEqual(["a", "b"]);
    expect(library.getRemovedSongs().get("a")?.title).toBe("Song a");

    vi.resetModules();
    const reloaded = await load();
    expect(reloaded.library.getRemovedSongs().get("a")?.title).toBe("Song a");
    expect(await reloaded.library.clearRemovedHistory()).toBe(1);
    expect(reloaded.library.getPlays().map((p) => p.trackId)).toEqual(["b"]);
    expect(reloaded.library.getRemovedSongs().get("a")).toBeUndefined();
    expect(await db.get("removed", "a")).toBeUndefined();
  });

  it("doesn't keep a name for a removed song that was never played", async () => {
    const { library, db } = await load();
    await library.addTrack({ track: makeTrack("a") });
    await library.removeTracks(new Set(["a"]));
    expect(await db.get("removed", "a")).toBeUndefined();
  });

  it("drops plays older than two years when the library loads, and from a restore", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-01-10"));
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a") });
    await library.recordPlay("a");
    vi.setSystemTime(new Date("2025-06-01"));
    await library.recordPlay("a");
    vi.setSystemTime(new Date("2026-01-11"));
    vi.resetModules();
    const reloaded = await load();
    await reloaded.library.addPlays([{ trackId: "a", at: new Date("2023-12-01").getTime() }], "failed");
    const years = async () => (await reloaded.db.getAll<import("./types").Play>("plays")).map((p) => new Date(p.at).getFullYear());
    await vi.waitFor(async () => expect(await years()).toEqual([2025]));
    expect(reloaded.library.getPlays().map((p) => new Date(p.at).getFullYear())).toEqual([2025]);
    vi.useRealTimers();
  });

  it("doesn't log a play for a song removed while it waited, or for one that was never saved", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a") });
    library.addSessionTracks([{ track: makeTrack("s", { source: { kind: "session" } }), file: new Blob(["opened"]) }]);
    await Promise.all([library.removeTracks(new Set(["a"])), library.recordPlay("a"), library.recordPlay("s")]);
    expect(library.getPlays()).toEqual([]);
  });

  it("keeps restored plays in time order among newer ones", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a") });
    await library.recordPlay("a");
    const earlier = Date.now() - 60_000;
    await library.addPlays([{ trackId: "a", at: earlier }], "failed");
    expect(library.getPlays()[0].at).toBe(earlier);
  });

  it("restores a removed song's history once, even from the same backup twice", async () => {
    const { library, db } = await load();
    const at = Date.now() - 60_000;
    const entry = { song: { title: "Old", artist: "Band", album: "", albumArtist: "Band", removedAt: at }, plays: [at, at + 1] };
    await library.addRemovedHistory([entry], "failed");
    await library.addRemovedHistory([entry], "failed");
    expect([...library.getRemovedSongs().values()].map((s) => s.title)).toEqual(["Old"]);
    expect(library.getPlays()).toHaveLength(2);
    expect(await db.getAll("plays")).toHaveLength(2);
  });

  it("saves neither the count nor the log entry when the save fails", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a") });
    const db = await import("./db");
    const real = db.write;
    const spy = vi.spyOn(db, "write").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await library.recordPlay("a");
    expect(library.getPlays()).toEqual([]);
    expect(library.getTrack("a")?.playCount).toBeUndefined();
    spy.mockImplementation(real);
    vi.restoreAllMocks();
  });

  it("adds the play log to a database made before it existed", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("tunenook", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("tracks", { keyPath: "id" });
        db.createObjectStore("files");
        db.createObjectStore("art");
        db.createObjectStore("playlists", { keyPath: "id" });
        db.createObjectStore("folders", { keyPath: "id" });
      };
      req.onsuccess = () => {
        const tx = req.result.transaction("tracks", "readwrite");
        tx.objectStore("tracks").put(makeTrack("old", { playCount: 4 }));
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
      };
      req.onerror = () => reject(req.error);
    });
    const { library } = await load();
    expect(library.getTrack("old")?.playCount).toBe(4);
    await library.recordPlay("old");
    expect(library.getPlays().map((p) => p.trackId)).toEqual(["old"]);
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

  it("groups songs that list different artists but share an album name into one album", async () => {
    const { groupAlbums, groupArtists } = await import("./library");
    const tracks = [
      makeTrack("a", { artist: "Queen", albumArtist: "", album: "Hits" }),
      makeTrack("b", { artist: "Queen feat. Bowie", albumArtist: "", album: "Hits " }),
    ];
    const albums = groupAlbums(tracks);
    expect(albums.map((a) => a.tracks.map((t) => t.id))).toEqual([["a", "b"]]);
    const [owner, guest] = groupArtists(albums);
    expect(owner.albums[0].tracks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(guest.albums).toEqual([]);
    expect(guest.appearsOn[0].tracks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(guest.tracks.map((t) => t.id)).toEqual(["b"]);
  });

  it("lists only artists who own an album or a song", async () => {
    const { groupAlbums, groupArtists, isListedArtist } = await import("./library");
    const tracks = [
      makeTrack("hits", { artist: "Blondie", albumArtist: "Various artists", album: "Hits" }),
      makeTrack("feat", { artist: "Queen feat. Bowie", albumArtist: "Queen", album: "" }),
      makeTrack("loose", { artist: "Abba", albumArtist: "", album: "" }),
    ];
    const listed = groupArtists(groupAlbums(tracks)).filter(isListedArtist);
    expect(listed.map((a) => a.name)).toEqual(["Abba", "Queen", "Various artists"]);
  });
});

describe("editTracks", () => {
  it("moves an untagged song onto an album and gives it that album's cover", async () => {
    const { library, db } = await load();
    const albumArt = "album:innuendo";
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
    const old = "album:lamplight";
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
    const old = "album:lamplight";
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

describe("session tracks", () => {
  it("can be found and played but never show in the lists or get saved", async () => {
    const { library, db } = await load();
    const file = new Blob(["opened"]);
    library.addSessionTracks([{ track: makeTrack("s", { source: { kind: "session" } }), file }]);
    expect(library.getTrack("s")?.title).toBe("Song s");
    expect(await library.storedFile("s")).toBe(file);
    expect(library.getTracks()).toEqual([]);
    expect(library.groupAlbums(library.getTracks())).toEqual([]);
    await library.toggleLike("s");
    await library.recordPlay("s");
    expect(await db.get("tracks", "s")).toBeUndefined();
    expect(library.getTrack("s")?.likedAt).toBeUndefined();
  });

  it("are left out of saved playlists", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a") });
    library.addSessionTracks([{ track: makeTrack("s", { source: { kind: "session" } }), file: new Blob(["opened"]) }]);
    const created = await library.createPlaylist("Queue", ["s", "a", "s"]);
    expect(library.getPlaylists()[0].trackIds).toEqual(["a"]);
    await library.addToPlaylist(created!.id, ["s"]);
    expect(library.getPlaylists()[0].trackIds).toEqual(["a"]);
  });
});

describe("favourites", () => {
  it("keeps favourite albums and playlists across a reload, newest first", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a", { album: "Lamplight" }) });
    await library.addTrack({ track: makeTrack("b", { album: "Ember" }) });
    const mix = await library.createPlaylist("Mix", ["a"]);
    const other = await library.createPlaylist("Other", ["b"]);
    expect(library.hasFavourites()).toBe(false);
    vi.spyOn(Date, "now").mockReturnValueOnce(1).mockReturnValueOnce(2).mockReturnValueOnce(3).mockReturnValueOnce(4);
    await library.toggleFavouriteAlbum("lamplight");
    await library.toggleFavouriteAlbum("ember");
    await library.toggleFavouritePlaylist(mix!.id);
    await library.toggleFavouritePlaylist(other!.id);
    await library.toggleFavouritePlaylist(other!.id);
    vi.restoreAllMocks();
    vi.resetModules();
    const { library: reloaded } = await load();
    expect(reloaded.hasFavourites()).toBe(true);
    expect((await readHook(reloaded.useFavouriteAlbums)).map((a) => a.title)).toEqual(["Ember", "Lamplight"]);
    expect((await readHook(reloaded.useFavouritePlaylists)).map((p) => p.name)).toEqual(["Mix"]);
  });

  it("shows a toggle at once and settles quick taps on what was tapped last", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a", { album: "Lamplight" }) });
    await library.addTrack({ track: makeTrack("b", { album: "Ember" }) });
    const seen: boolean[] = [];
    const { act, stop } = await probeHook(() => library.useIsFavouriteAlbum("lamplight"), (v) => seen.push(v));
    let saves: Promise<void>[] = [];
    try {
      act(() => {
        saves = [library.toggleFavouriteAlbum("lamplight"), library.toggleFavouriteAlbum("ember"), library.toggleFavouriteAlbum("ember")];
      });
    } finally {
      stop();
    }
    expect(seen).toEqual([false, true]);
    await Promise.all(saves);
    vi.resetModules();
    const { library: reloaded } = await load();
    expect(reloaded.isFavouriteAlbum("lamplight")).toBe(true);
    expect(reloaded.isFavouriteAlbum("ember")).toBe(false);
  });

  it("moves an album's favourite with a rename, from wherever the edit comes", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a", { album: "Lamplight" }) });
    await library.addTrack({ track: makeTrack("b", { album: "Lamplight" }) });
    await library.toggleFavouriteAlbum("lamplight");
    // Moving one song leaves the album, so the favourite stays.
    await library.editTracks(new Map([["a", { album: "Ember" }]]));
    expect(library.isFavouriteAlbum("lamplight")).toBe(true);
    await library.editTracks(new Map([["b", { album: "Ember" }]]));
    vi.resetModules();
    const { library: reloaded } = await load();
    expect(reloaded.isFavouriteAlbum("lamplight")).toBe(false);
    expect((await readHook(reloaded.useFavouriteAlbums)).map((a) => a.title)).toEqual(["Ember"]);
  });

  it("drops a favourite once its album's songs are removed, so a namesake isn't a favourite", async () => {
    const { library } = await load();
    await library.addTrack({ track: makeTrack("a", { album: "Greatest Hits", albumArtist: "Queen" }) });
    await library.addTrack({ track: makeTrack("b", { album: "Greatest Hits", albumArtist: "Queen" }) });
    await library.toggleFavouriteAlbum("greatest hits");
    await library.removeTracks(new Set(["a"]));
    expect(library.hasFavourites()).toBe(true);
    await library.removeTracks(new Set(["b"]));
    expect(library.hasFavourites()).toBe(false);
    await library.addTrack({ track: makeTrack("c", { album: "Greatest Hits", albumArtist: "Abba" }) });
    vi.resetModules();
    const { library: reloaded } = await load();
    expect(reloaded.isFavouriteAlbum("greatest hits")).toBe(false);
  });
});
