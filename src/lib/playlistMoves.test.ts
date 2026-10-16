import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { freshEnvironment, makeTrack } from "./testing";

beforeEach(freshEnvironment);

describe("movePlaylistRow", () => {
  it("moves by visible row, stepping over songs that left the library", async () => {
    const library = await import("./library");
    const { movePlaylistRow } = await import("./playlistMoves");
    const { getAnnouncement } = await import("./announce");
    await library.loadLibrary();
    for (const id of ["a", "b", "c"]) await library.addTrack({ track: makeTrack(id) });
    const p = await library.createPlaylist("Mix", ["a", "gone", "b", "c"]);
    movePlaylistRow(p!.id, 0, 1);
    expect(library.getPlaylists()[0].trackIds).toEqual(["gone", "b", "a", "c"]);
    expect(getAnnouncement()).toBe("Song a moved to position 2 of 3.");
  });

  it("ignores rows outside the list", async () => {
    const library = await import("./library");
    const { movePlaylistRow } = await import("./playlistMoves");
    await library.loadLibrary();
    await library.addTrack({ track: makeTrack("a") });
    const p = await library.createPlaylist("Mix", ["a"]);
    movePlaylistRow(p!.id, 0, 3);
    expect(library.getPlaylists()[0].trackIds).toEqual(["a"]);
  });
});
