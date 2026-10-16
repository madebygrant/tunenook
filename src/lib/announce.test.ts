import { describe, expect, it } from "vitest";
import { announce, getAnnouncement } from "./announce";

describe("announce", () => {
  it("changes the text when the same message is announced twice, so it's read again", () => {
    announce("Moved");
    const first = getAnnouncement();
    announce("Moved");
    expect(getAnnouncement()).not.toBe(first);
    expect(getAnnouncement().trim()).toBe("Moved");
    announce("Moved");
    expect(getAnnouncement()).toBe("Moved");
  });
});
