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
