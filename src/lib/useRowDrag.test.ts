import { describe, expect, it } from "vitest";
import { dropIndex } from "./useRowDrag";

const H = 64;

describe("dropIndex", () => {
  it("stays put until the row has moved past half a row", () => {
    expect(dropIndex(5, 2, 30, H)).toBe(2);
    expect(dropIndex(5, 2, -30, H)).toBe(2);
  });

  it("moves a row for each row height dragged", () => {
    expect(dropIndex(5, 1, 2 * H + 10, H)).toBe(3);
    expect(dropIndex(5, 3, -2 * H, H)).toBe(1);
  });

  it("stops at the ends of the list", () => {
    expect(dropIndex(5, 1, 50 * H, H)).toBe(4);
    expect(dropIndex(5, 4, -50 * H, H)).toBe(0);
  });

  it("stays exact far down a long list", () => {
    expect(dropIndex(300, 0, 250 * H, H)).toBe(250);
  });
});
