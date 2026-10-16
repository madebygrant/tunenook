import { describe, expect, it } from "vitest";
import { positionState } from "./mediaSession";

describe("positionState", () => {
  it("passes through a position inside the duration", () => {
    expect(positionState(600, 42, 1.5)).toEqual({ duration: 600, position: 42, playbackRate: 1.5 });
  });

  it("clamps the position to the duration", () => {
    expect(positionState(600, 601, 1)?.position).toBe(600);
    expect(positionState(600, -1, 1)?.position).toBe(0);
  });

  it("has no state for an unknown or live duration", () => {
    expect(positionState(NaN, 0, 1)).toBeNull();
    expect(positionState(Infinity, 10, 1)).toBeNull();
    expect(positionState(0, 0, 1)).toBeNull();
  });
});
