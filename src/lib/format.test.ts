import { describe, expect, it } from "vitest";
import { formatBytes, formatClock, formatTotal, plural } from "./format";

describe("format", () => {
  it("formats clock times", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("formats totals", () => {
    expect(formatTotal(600)).toBe("10 min");
    expect(formatTotal(16)).toBe("1 min");
    expect(formatTotal(7200)).toBe("2 hr");
    expect(formatTotal(5400)).toBe("1 hr 30 min");
  });

  it("formats sizes and counts", () => {
    expect(formatBytes(2_500_000)).toBe("3 MB");
    expect(formatBytes(1_200_000_000)).toBe("1.2 GB");
    expect(plural(1, "song")).toBe("1 song");
    expect(plural(1200, "song")).toBe("1,200 songs");
  });
});
