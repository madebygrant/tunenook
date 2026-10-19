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

  it("toggles mute on the audio element", async () => {
    const { player, audio } = await setup(["a"]);
    player.toggleMute();
    expect(audio.muted).toBe(true);
    expect(player.isMuted()).toBe(true);
    player.toggleMute();
    expect(player.isMuted()).toBe(false);
  });

  it("remembers the volume and unmutes when it's moved", async () => {
    const { player, audio } = await setup(["a"]);
    player.toggleMute();
    player.setVolume(0.4);
    expect(audio.volume).toBe(0.4);
    expect(audio.muted).toBe(false);
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.getItem("tunenook.volume")).toBe("0.4");
  });

  it("brings the sound back from a volume of 0 with mute", async () => {
    const { player, audio } = await setup(["a"]);
    player.setVolume(0.6);
    player.setVolume(0);
    player.toggleMute();
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBe(0.6);
  });
});

describe("output picker", () => {
  it("is offered only where the browser has one, and opens it", async () => {
    const { player } = await setup([]);
    expect(player.canPickOutput()).toBe(false);
    const show = vi.fn();
    Object.assign(document.querySelector("audio")!, { webkitShowPlaybackTargetPicker: show });
    expect(player.canPickOutput()).toBe(true);
    player.pickOutput();
    expect(show).toHaveBeenCalledOnce();
  });

  it("tracks when an AirPlay speaker takes over the sound", async () => {
    const { player, audio } = await setup([]);
    const seen: boolean[] = [];
    const { createRoot } = await import("react-dom/client");
    const { act, createElement } = await import("react");
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    env.IS_REACT_ACT_ENVIRONMENT = true;
    try {
      function Probe() {
        seen.push(player.useWirelessOutput());
        return null;
      }
      const root = createRoot(document.createElement("div"));
      act(() => root.render(createElement(Probe)));
      Object.assign(audio, { webkitCurrentPlaybackTargetIsWireless: true });
      act(() => void audio.dispatchEvent(new Event("webkitcurrentplaybacktargetiswirelesschanged")));
      Object.assign(audio, { webkitCurrentPlaybackTargetIsWireless: false });
      act(() => void audio.dispatchEvent(new Event("webkitcurrentplaybacktargetiswirelesschanged")));
      act(() => root.unmount());
    } finally {
      delete env.IS_REACT_ACT_ENVIRONMENT;
    }
    expect(seen).toEqual([false, true, false]);
  });
});

describe("sleep timer", () => {
  it("stops at the end of the song playing then, even after a skip, with the next one ready", async () => {
    const { player, audio, loaded } = await setup(["a", "b", "c"]);
    player.playTracks(["a", "b", "c"], 0);
    await loaded("a");
    player.setSleepTimer("song");
    player.next();
    await loaded("b");
    const plays = vi.mocked(audio.play).mock.calls.length;
    audio.dispatchEvent(new Event("ended"));
    await loaded("c");
    expect(vi.mocked(audio.play).mock.calls.length).toBe(plays);
    expect(player.getSleepTimer()).toBeNull();
  });

  it("fades over the last ten seconds, then pauses and restores the volume", async () => {
    const { player, audio } = await setup(["a"]);
    player.playTracks(["a"], 0);
    // loaded() can pass on the silent unlock clip; playing is only set once the song itself plays.
    await vi.waitFor(() => expect(player.getNowPlaying().playing).toBe(true));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      player.setVolume(0.8);
      player.setSleepTimer(15);
      vi.advanceTimersByTime(15 * 60_000 - 5000);
      expect(audio.volume).toBeCloseTo(0.4);
      expect(audio.pause).not.toHaveBeenCalled();
      vi.advanceTimersByTime(5000);
      expect(audio.pause).toHaveBeenCalled();
      expect(audio.volume).toBeLessThan(0.1);
      expect(player.getSleepTimer()).toBeNull();
      player.toggle();
      expect(audio.volume).toBe(0.8);
    } finally {
      vi.useRealTimers();
    }
  });
});
