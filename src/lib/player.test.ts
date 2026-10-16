import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnvironment, makeTrack } from "./testing";

beforeEach(freshEnvironment);

// Songs listed in withoutFile are in the library but their stored file is missing.
async function setup(ids: string[], withoutFile: string[] = []) {
  const library = await import("./library");
  const player = await import("./player");
  await library.loadLibrary();
  for (const id of ids) {
    await library.addTrack({ track: makeTrack(id), file: withoutFile.includes(id) ? undefined : new Blob(["abc"]) });
  }
  player.initPlayer();
  const audio = document.querySelector("audio")!;
  const current = () => player.getNowPlaying().id;
  const loaded = async (id: string) => vi.waitFor(() => expect(current() === id && !player.getNowPlaying().failure && audio.src.startsWith("blob:")).toBe(true));
  return { library, player, audio, current, loaded };
}

describe("player", () => {
  it("moves to the next song when one ends", async () => {
    const { player, audio, loaded } = await setup(["a", "b"]);
    player.playTracks(["a", "b"], 0);
    await loaded("a");
    audio.dispatchEvent(new Event("ended"));
    await loaded("b");
    expect(audio.play).toHaveBeenCalled();
  });

  it("plays the same song again on repeat one", async () => {
    const { player, audio, current, loaded } = await setup(["a", "b"]);
    player.playTracks(["a", "b"], 0);
    await loaded("a");
    player.cycleRepeat();
    player.cycleRepeat();
    expect(player.getQueue().repeat).toBe("one");
    const plays = vi.mocked(audio.play).mock.calls.length;
    audio.dispatchEvent(new Event("ended"));
    expect(current()).toBe("a");
    expect(vi.mocked(audio.play).mock.calls.length).toBe(plays + 1);
  });

  it("stops at the end of the queue with repeat off", async () => {
    const { player, audio, current, loaded } = await setup(["a"]);
    player.playTracks(["a"], 0);
    await loaded("a");
    audio.dispatchEvent(new Event("ended"));
    expect(audio.pause).toHaveBeenCalled();
    expect(current()).toBe("a");
  });

  it("loads the next song when the current one is removed from the library", async () => {
    const { library, player, loaded } = await setup(["a", "b", "c"]);
    player.playTracks(["a", "b", "c"], 0);
    await loaded("a");
    await library.removeTracks(new Set(["a"]));
    await loaded("b");
    expect(player.getQueue().ids).toEqual(["b", "c"]);
  });

  it("skips a song whose file is missing", async () => {
    const { player, loaded } = await setup(["a", "b"], ["a"]);
    player.playTracks(["a", "b"], 0);
    await loaded("b");
  });

  it("gives up after three missing files in a row", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    const { player, current } = await setup(ids, ids);
    player.playTracks(ids, 0);
    await vi.waitFor(() => expect(current()).toBe("d"));
    await vi.waitFor(() => expect(player.getNowPlaying().failure).toEqual({ kind: "error" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(current()).toBe("d");
  });

  it("restores a saved queue without songs that have gone", async () => {
    const { player, current } = await setup(["a", "b"]);
    const saved = { ids: ["a", "gone", "b"], order: [0, 1, 2], at: 2, shuffle: false, repeat: "all" };
    localStorage.setItem("tunenook.queue", JSON.stringify({ queue: saved, position: 12 }));
    player.restoreQueue();
    expect(player.getQueue().ids).toEqual(["a", "b"]);
    await vi.waitFor(() => expect(current()).toBe("b"));
    expect(player.getNowPlaying().playing).toBe(false);
  });

  it("ignores a corrupt saved queue", async () => {
    const { player, current } = await setup(["a"]);
    localStorage.setItem("tunenook.queue", JSON.stringify({ queue: { ids: ["a"], order: [5], at: 0 }, position: 1 }));
    player.restoreQueue();
    expect(player.getQueue().ids).toEqual([]);
    expect(current()).toBeNull();
  });

  it("makes one object URL when a prefetch and a load ask for the same song together", async () => {
    const { player, loaded } = await setup(["a", "b"]);
    player.playTracks(["a", "b"], 0);
    // Prefetches "a" again while its load is still in flight.
    player.cycleRepeat();
    await loaded("a");
    await new Promise((r) => setTimeout(r, 50));
    // The silent unlock clip, "a" and the prefetched "b".
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  });
});
