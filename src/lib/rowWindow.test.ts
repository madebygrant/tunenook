import { describe, expect, it } from "vitest";
import { rowRange, rowRuns } from "./rowWindow";

describe("rowRange", () => {
  it("covers the visible rows with some to spare, snapped to steps of eight", () => {
    // Rows 100 to 115 are on screen.
    const range = rowRange(10000, 64, 200, 200 + 100 * 64, 15 * 64);
    expect(range.start).toBeLessThanOrEqual(100 - 12);
    expect(range.end).toBeGreaterThanOrEqual(115 + 12);
    expect(range.start % 8).toBe(0);
    expect(range.end % 8).toBe(0);
  });

  it("stays inside the list at both ends", () => {
    expect(rowRange(300, 64, 200, 0, 800).start).toBe(0);
    expect(rowRange(300, 64, 200, 1e6, 800)).toEqual({ start: 296, end: 300 });
  });

  it("draws the first rows before any row has been measured", () => {
    expect(rowRange(10000, 0, 0, 0, 800)).toEqual({ start: 0, end: 40 });
  });
});

describe("rowRuns", () => {
  it("adds a pinned row far from the range as its own run", () => {
    expect(rowRuns(1000, { start: 400, end: 440 }, [3, null])).toEqual([
      { from: 3, to: 4 },
      { from: 400, to: 440 },
    ]);
  });

  it("merges pinned rows that touch the range and ignores ones outside the list", () => {
    expect(rowRuns(1000, { start: 400, end: 440 }, [440, 420, 5000, -1])).toEqual([{ from: 400, to: 441 }]);
  });
});
