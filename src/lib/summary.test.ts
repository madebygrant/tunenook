import { describe, expect, it } from "vitest";
import { emptySummary } from "./importer";
import { describeImport } from "./summary";

describe("describeImport", () => {
  it("leads with the count and lists only what happened", () => {
    expect(describeImport({ ...emptySummary(), added: 12, duplicates: 1 })).toBe("Added 12 songs. 1 song was already here.");
  });

  it("says when it stopped for space instead of listing failures", () => {
    expect(describeImport({ ...emptySummary(), added: 2, failed: ["c"], outOfSpace: true })).toBe(
      "Added 2 songs. Stopped: this device is out of space.",
    );
  });

  it("names a few problem files and counts the rest", () => {
    const text = describeImport({ ...emptySummary(), failed: ["a", "b", "c", "d", "e"] });
    expect(text).toBe("No new songs. Couldn't add a, b, c and 2 more.");
  });
});
