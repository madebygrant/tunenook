import { describe, expect, it } from "vitest";
import { makeTrack } from "./testing";
import { rowKeys } from "./useSelection";

describe("rowKeys", () => {
  it("tells repeats of the same song apart", () => {
    const [a, b] = [makeTrack("a"), makeTrack("b")];
    expect(rowKeys([a, b, a, a])).toEqual(["a#0", "b#0", "a#1", "a#2"]);
  });
});
