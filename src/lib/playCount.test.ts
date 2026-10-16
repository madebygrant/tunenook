import { describe, expect, it } from "vitest";
import { createListenCounter } from "./playCount";

// Plays from `from` to `to` in quarter-second ticks, returning how many times a play was counted.
function listen(counter: ReturnType<typeof createListenCounter>, from: number, to: number, duration: number): number {
  let counts = 0;
  for (let t = from; t <= to; t += 0.25) if (counter.observe(t, duration)) counts++;
  return counts;
}

describe("listen counter", () => {
  it("counts a long song after 30 seconds", () => {
    const counter = createListenCounter();
    expect(listen(counter, 0, 29.5, 300)).toBe(0);
    expect(listen(counter, 29.75, 31, 300)).toBe(1);
  });

  it("counts a short song at half its length", () => {
    const counter = createListenCounter();
    expect(listen(counter, 0, 9.75, 20)).toBe(0);
    expect(listen(counter, 10, 11, 20)).toBe(1);
  });

  it("counts once, even after seeking back and listening again", () => {
    const counter = createListenCounter();
    expect(listen(counter, 0, 40, 300)).toBe(1);
    expect(listen(counter, 0, 40, 300)).toBe(0);
  });

  it("doesn't count a seek past the threshold as listening", () => {
    const counter = createListenCounter();
    expect(listen(counter, 0, 5, 300)).toBe(0);
    counter.jumped();
    expect(listen(counter, 200, 210, 300)).toBe(0);
    expect(listen(counter, 210.25, 225, 300)).toBe(1);
  });

  it("counts listening reported in large steps, as on a locked phone", () => {
    const counter = createListenCounter();
    const counts = [0, 5, 10, 15, 20, 25, 30].filter((t) => counter.observe(t, 300)).length;
    expect(counts).toBe(1);
  });

  it("counts again after a reset", () => {
    const counter = createListenCounter();
    expect(listen(counter, 0, 40, 300)).toBe(1);
    counter.reset();
    expect(listen(counter, 0, 40, 300)).toBe(1);
  });
});
