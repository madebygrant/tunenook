import { beforeEach, describe, expect, it, vi } from "vitest";
import type { View } from "../components/Sidebar";
import { onViewPop, openLayer, pushView, viewFromHash, viewHash } from "./history";

const VIEWS: View[] = [
  { kind: "songs" },
  { kind: "albums" },
  { kind: "album", key: "ac/dc\nback in black" },
  { kind: "album", key: "various artists\n100% hits: 50 songs?" },
  { kind: "playlists" },
  { kind: "playlist", id: "5f0c7a1e-1d2b-4c3d-9e8f-001122334455" },
  { kind: "queue" },
  { kind: "add" },
];

describe("viewHash and viewFromHash", () => {
  it("round-trips every view kind", () => {
    for (const view of VIEWS) expect(viewFromHash(viewHash(view))).toEqual(view);
  });

  it("keeps slashes, spaces and newlines inside one hash segment", () => {
    expect(viewHash({ kind: "album", key: "a/b c\nd" })).toBe("#/album/a%2Fb%20c%0Ad");
  });

  it("rejects unknown, empty and malformed hashes", () => {
    for (const hash of ["", "#", "#/", "#/nope", "#/songs/extra", "#/album", "#/album/%E0%A4%A", "#songs"]) {
      expect(viewFromHash(hash)).toBeNull();
    }
  });
});

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("layers", () => {
  beforeEach(async () => {
    history.replaceState(null, "", "#/songs");
    await settle();
  });

  it("adds one entry per open layer, even when opened, closed and opened again at once", async () => {
    const start = history.length;
    const layer = { close: vi.fn() };
    openLayer(layer)();
    const remove = openLayer(layer);
    await settle();
    expect(history.length).toBe(start + 1);
    expect(history.state).toEqual({ layer: 1 });
    remove();
    await settle();
  });

  it("closes the layer when Back pops its entry, without reporting a view change", async () => {
    const close = vi.fn();
    const onView = vi.fn();
    const stop = onViewPop(onView);
    const remove = openLayer({ close });
    await settle();
    history.back();
    await settle();
    expect(close).toHaveBeenCalledTimes(1);
    expect(history.state).toBeNull();
    expect(onView).toHaveBeenCalledWith({ kind: "songs" });
    remove();
    await settle();
    expect(history.state).toBeNull();
    stop();
  });

  it("pops its entry when the layer closes some other way, and doesn't report that step", async () => {
    const onView = vi.fn();
    const stop = onViewPop(onView);
    const remove = openLayer({ close: vi.fn() });
    await settle();
    remove();
    await settle();
    expect(history.state).toBeNull();
    expect(onView).not.toHaveBeenCalled();
    stop();
  });

  it("gives a layer opened during that step back an entry of its own", async () => {
    const removeFirst = openLayer({ close: vi.fn() });
    await settle();
    removeFirst();
    await Promise.resolve();
    expect(history.state).toEqual({ layer: 1 });
    const close = vi.fn();
    const remove = openLayer({ close });
    await settle();
    expect(history.state).toEqual({ layer: 1 });
    history.back();
    await settle();
    expect(close).toHaveBeenCalledTimes(1);
    remove();
    await settle();
  });

  it("drops every layer entry when navigating from inside two layers", async () => {
    const removeLower = openLayer({ close: vi.fn() });
    const removeUpper = openLayer({ close: vi.fn() });
    await settle();
    expect(history.state).toEqual({ layer: 2 });
    pushView({ kind: "queue" });
    removeUpper();
    removeLower();
    await settle();
    expect(location.hash).toBe("#/queue");
    expect(history.state).toBeNull();
    history.back();
    await settle();
    expect(location.hash).toBe("#/songs");
    expect(history.state).toBeNull();
  });

  it("replaces an unknown hash reached by Back with Songs", async () => {
    const onView = vi.fn();
    const stop = onViewPop(onView);
    history.pushState(null, "", "#/nope");
    history.pushState(null, "", "#/albums");
    history.back();
    await settle();
    expect(location.hash).toBe("#/songs");
    expect(onView).toHaveBeenCalledWith({ kind: "songs" });
    stop();
  });
});
