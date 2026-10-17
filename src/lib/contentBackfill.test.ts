import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnvironment, makeTrack } from "./testing";

beforeEach(freshEnvironment);

async function setup(count: number) {
  const library = await import("./library");
  const db = await import("./db");
  const folders = await import("./folders");
  const player = await import("./player");
  const standalone = await import("./standalone");
  const { contentKey } = await import("./contentKey");
  const { startContentBackfill } = await import("./contentBackfill");
  await library.loadLibrary();
  const files = Array.from({ length: count }, (_, i) => new Blob([`song ${i}`]));
  for (const [i, file] of files.entries()) await library.addTrack({ track: makeTrack(`s${i}`), file });
  // fake-indexeddb hands stored blobs back as plain objects, so reads come from here instead.
  const reads = vi.spyOn(library, "storedFile").mockImplementation(async (id) => files[Number(id.slice(1))]);
  return { library, db, folders, player, standalone, contentKey, startContentBackfill, files, reads };
}

describe("startContentBackfill", () => {
  it("fills in keys for stored songs and saves them", async () => {
    const { library, db, contentKey, startContentBackfill, files } = await setup(10);
    await startContentBackfill();
    expect(library.getTrack("s3")?.contentKey).toBe(await contentKey(files[3]));
    expect((await db.get<import("./types").Track>("tracks", "s9"))?.contentKey).toBe(await contentKey(files[9]));
  });

  it("carries on from where it stopped: songs that already have a key aren't read again", async () => {
    const { library, startContentBackfill, reads } = await setup(4);
    await library.updateTracks(new Map([["s0", { contentKey: "done" }], ["s1", { contentKey: "done" }]]));
    await startContentBackfill();
    expect(reads.mock.calls.map(([id]) => id)).toEqual(["s2", "s3"]);
  });

  it("doesn't read linked songs whose folder isn't allowed, and picks them up once it is", async () => {
    const { library, folders, startContentBackfill } = await setup(0);
    await library.addTrack({ track: makeTrack("l", { source: { kind: "linked", folderId: "f", path: "x.mp3" } }) });
    const linked = vi.spyOn(folders, "linkedFile").mockResolvedValue(new File(["linked"], "x.mp3"));
    await startContentBackfill();
    expect(linked).not.toHaveBeenCalled();
    vi.spyOn(folders, "isGranted").mockReturnValue(true);
    await startContentBackfill();
    expect(library.getTrack("l")?.contentKey).toBeDefined();
  });

  it("runs again when started during a run", async () => {
    const { library, folders, startContentBackfill } = await setup(1);
    await library.addTrack({ track: makeTrack("l", { source: { kind: "linked", folderId: "f", path: "x.mp3" } }) });
    vi.spyOn(folders, "linkedFile").mockResolvedValue(new File(["linked"], "x.mp3"));
    const first = startContentBackfill();
    vi.spyOn(folders, "isGranted").mockReturnValue(true);
    void startContentBackfill();
    await first;
    expect(library.getTrack("l")?.contentKey).toBeDefined();
  });

  it("waits while a song plays on iOS", async () => {
    const { player, standalone, startContentBackfill, reads } = await setup(1);
    // Only the backfill's own waits; storage keeps its real scheduling.
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.spyOn(standalone, "isIOS").mockReturnValue(true);
    const playing = vi.spyOn(player, "getNowPlaying").mockReturnValue({ ...player.getNowPlaying(), playing: true });
    const done = startContentBackfill();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(reads).not.toHaveBeenCalled();
    playing.mockReturnValue({ ...player.getNowPlaying(), playing: false });
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(reads).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
