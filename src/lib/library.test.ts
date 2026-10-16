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
