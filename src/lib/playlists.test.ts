import { describe, expect, it } from "vitest";
import { missingFrom, moved, newPlaylist, renamed, withInserted, withoutIndexes, withoutTracks, withTracks } from "./playlists";

const base = newPlaylist("p", "  Road trip ", ["a", "b", "c"], 1);

describe("playlists", () => {
  it("trims the name and falls back when blank", () => {
    expect(base.name).toBe("Road trip");
    expect(newPlaylist("q", "  ", [], 1).name).toBe("Untitled playlist");
    expect(renamed(base, " ", 2).name).toBe("Road trip");
  });

  it("appends, allowing repeats", () => {
    expect(withTracks(base, ["a"], 2).trackIds).toEqual(["a", "b", "c", "a"]);
  });

  it("removes one position, not every copy", () => {
    const p = withTracks(base, ["a"], 2);
    expect(withoutIndexes(p, new Set([0]), 3).trackIds).toEqual(["b", "c", "a"]);
  });

  it("removes every copy of deleted tracks and keeps identity when nothing changes", () => {
    expect(withoutTracks(withTracks(base, ["a"], 2), new Set(["a"]), 3).trackIds).toEqual(["b", "c"]);
    expect(withoutTracks(base, new Set(["z"]), 3)).toBe(base);
  });

  it("moves a track", () => {
    expect(moved(base, 0, 2, 2).trackIds).toEqual(["b", "c", "a"]);
    expect(moved(base, 2, 0, 2).trackIds).toEqual(["c", "a", "b"]);
    expect(moved(base, 0, 5, 2)).toBe(base);
  });

  it("lists the songs a playlist doesn't have yet, keeping their order and repeats", () => {
    expect(missingFrom(base, ["d", "a", "e", "d"])).toEqual(["d", "e", "d"]);
    expect(missingFrom(base, ["a", "b"])).toEqual([]);
  });

  it("removes several positions at once, keeping other repeats of the same song", () => {
    const p = newPlaylist("p", "Mix", ["a", "b", "a", "c"], 1);
    expect(withoutIndexes(p, new Set([0, 3]), 2).trackIds).toEqual(["b", "a"]);
    expect(withoutIndexes(p, new Set(), 2)).toBe(p);
  });

  it("undoes a removal by putting entries back where they were, keeping songs added since", () => {
    const p = newPlaylist("p", "Mix", ["a", "b", "c", "d"], 1);
    const removed = withoutIndexes(p, new Set([1, 3]), 2);
    expect(withInserted(removed, [[1, "b"], [3, "d"]], 3).trackIds).toEqual(["a", "b", "c", "d"]);
    const grown = withTracks(removed, ["e"], 3);
    expect(withInserted(grown, [[3, "d"], [1, "b"]], 4).trackIds).toEqual(["a", "b", "c", "d", "e"]);
  });
});
