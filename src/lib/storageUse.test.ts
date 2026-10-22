import { describe, expect, it } from "vitest";
import { groupAlbums } from "./library";
import { largestAlbums, largestSongs, playlistSizes, share, usageParts } from "./storageUse";
import { makeTrack } from "./testing";

const linked = { kind: "linked", folderId: "f", path: "x.mp3" } as const;
const tracks = [
  makeTrack("a", { album: "Big", size: 500 }),
  makeTrack("b", { album: "Big", size: 300 }),
  makeTrack("c", { album: "Small", size: 100 }),
  makeTrack("d", { album: "Linked", size: 900, source: linked }),
  makeTrack("e", { size: 50 }),
];

describe("usageParts", () => {
  it("counts only stored audio and puts the rest of the browser's total last", () => {
    const parts = usageParts({ tracks, playlists: [], plays: [], removed: new Map(), artBytes: 2000, usage: 1_000_000 });
    expect(parts.map((p) => p.key)).toEqual(["audio", "art", "details", "history", "other"]);
    expect(parts.find((p) => p.key === "audio")?.bytes).toBe(950);
    const known = parts.slice(0, -1).reduce((n, p) => n + (p.bytes ?? 0), 0);
    expect(parts.at(-1)?.bytes).toBe(1_000_000 - known);
  });

  it("leaves out the rest when the browser can't say, or reports less than is known", () => {
    const keys = (usage: number | null) =>
      usageParts({ tracks, playlists: [], plays: [], removed: new Map(), artBytes: 0, usage }).map((p) => p.key);
    expect(keys(null)).not.toContain("other");
    expect(keys(10)).not.toContain("other");
  });

  it("has no overhead part when the artwork couldn't be measured", () => {
    const parts = usageParts({ tracks, playlists: [], plays: [], removed: new Map(), artBytes: null, usage: 1_000_000 });
    expect(parts.find((p) => p.key === "art")?.bytes).toBeNull();
    expect(parts.map((p) => p.key)).not.toContain("other");
  });
});

describe("share", () => {
  it("never shows a sliver as 0% or a near-whole as 100%", () => {
    expect(share(0, 100)).toBe("0%");
    expect(share(1, 1000)).toBe("<1%");
    expect(share(996, 1000)).toBe(">99%");
    expect(share(1000, 1000)).toBe("100%");
    expect(share(255, 1000)).toBe("26%");
  });
});

describe("largest", () => {
  it("ranks albums by the audio TuneNook holds, leaving out short albums and songs with no album", () => {
    const album = (name: string, sizes: number[], patch = {}) =>
      sizes.map((size, i) => makeTrack(`${name}${i}`, { album: name, size, ...patch }));
    const list = [
      ...album("Big", [500, 300, 100, 100]),
      ...album("Small", [10, 10, 10, 10]),
      ...album("Short", [900, 900, 900]),
      ...album("Linked", [900, 900, 900, 900], { source: linked }),
      ...Array.from({ length: 4 }, (_, i) => makeTrack(`loose${i}`, { size: 900 })),
    ];
    expect(largestAlbums(groupAlbums(list), 5).map((a) => [a.item.title, a.bytes])).toEqual([
      ["Big", 1000],
      ["Small", 40],
    ]);
  });

  it("ranks songs by the audio TuneNook holds", () => {
    expect(largestSongs(tracks, 2).map((s) => s.item.id)).toEqual(["a", "b"]);
  });

  it("sizes a playlist by its stored songs, counting a repeated song once", () => {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const playlists = [
      { id: "p", name: "Mix", trackIds: ["c", "c", "d", "gone"], createdAt: 1, updatedAt: 1 },
      { id: "q", name: "Big", trackIds: ["a"], createdAt: 1, updatedAt: 1 },
    ];
    expect(playlistSizes(playlists, byId).map((p) => [p.item.name, p.bytes])).toEqual([
      ["Big", 500],
      ["Mix", 100],
    ]);
  });
});
