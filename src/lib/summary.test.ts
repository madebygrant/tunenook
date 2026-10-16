import { describe, expect, it } from "vitest";
import { emptySummary } from "./importer";
import { describeImport } from "./summary";

describe("describeImport", () => {
  it("leads with the count and lists only what happened", () => {
    expect(describeImport({ ...emptySummary(), added: 12, duplicates: 1 })).toBe("Added 12 songs. 1 song was already here.");
  });

  it("names a few problem files and counts the rest", () => {
    const text = describeImport({ ...emptySummary(), failed: ["a", "b", "c", "d", "e"] });
    expect(text).toBe("No new songs. Couldn't add a, b, c and 2 more.");
  });
});
