import { describe, expect, it } from "vitest";
import {
  append,
  currentId,
  cycleRepeat,
  EMPTY_QUEUE,
  idAt,
  nextAt,
  playNext,
  prevAt,
  removeIds,
  removePositions,
  start,
  toggleShuffle,
} from "./queue";

const ids = ["a", "b", "c", "d"];
const reverse = () => 0.999;

function playOrder(q: ReturnType<typeof start>): string[] {
  return q.order.map((_, pos) => idAt(q, pos));
}

describe("queue", () => {
  it("starts at the chosen song", () => {
    const q = start(ids, 2, false, "off");
    expect(currentId(q)).toBe("c");
    expect(q.at).toBe(2);
  });

  it("puts the chosen song first when shuffled and keeps every song", () => {
    const q = start(ids, 2, true, "off", reverse);
    expect(currentId(q)).toBe("c");
    expect(q.at).toBe(0);
    expect([...playOrder(q)].sort()).toEqual(ids);
  });

  it("stops at the end with repeat off and wraps with repeat all", () => {
    const q = start(ids, 3, false, "off");
    expect(nextAt(q, true)).toBeNull();
    expect(nextAt({ ...q, repeat: "all" }, true)).toBe(0);
  });

  it("holds on repeat one only when the song ended by itself", () => {
    const q = start(ids, 1, false, "one");
    expect(nextAt(q, true)).toBe(1);
    expect(nextAt(q, false)).toBe(2);
  });

  it("goes back, wrapping only when repeating", () => {
    expect(prevAt(start(ids, 0, false, "off"))).toBeNull();
    expect(prevAt(start(ids, 0, false, "all"))).toBe(3);
    expect(prevAt(start(ids, 2, false, "off"))).toBe(1);
  });

  it("keeps the current song when shuffle toggles", () => {
    const q = start(ids, 2, false, "off");
    const on = toggleShuffle(q, reverse);
    expect(currentId(on)).toBe("c");
    const off = toggleShuffle(on);
    expect(currentId(off)).toBe("c");
    expect(playOrder(off)).toEqual(ids);
  });

  it("cycles repeat off, all, one", () => {
    const q = cycleRepeat(cycleRepeat(EMPTY_QUEUE));
    expect(q.repeat).toBe("one");
    expect(cycleRepeat(q).repeat).toBe("off");
  });

  it("inserts play-next songs after the current one", () => {
    const q = playNext(start(ids, 1, false, "off"), ["x", "y"]);
    expect(playOrder(q)).toEqual(["a", "b", "x", "y", "c", "d"]);
    expect(currentId(q)).toBe("b");
  });

  it("appends to the end, or starts a queue when empty", () => {
    expect(playOrder(append(start(ids, 0, false, "off"), ["x"]))).toEqual([...ids, "x"]);
    expect(currentId(append(EMPTY_QUEUE, ["x"]))).toBe("x");
  });

  it("removes earlier positions without moving off the current song", () => {
    const { queue, currentRemoved } = removePositions(start(ids, 2, false, "off"), new Set([0]));
    expect(currentRemoved).toBe(false);
    expect(currentId(queue)).toBe("c");
    expect(queue.ids).toEqual(["b", "c", "d"]);
  });

  it("hands over to the next song when the current one is removed", () => {
    const { queue, currentRemoved } = removeIds(start(ids, 1, false, "off"), new Set(["b"]));
    expect(currentRemoved).toBe(true);
    expect(currentId(queue)).toBe("c");
  });

  it("keeps the list order for unshuffling after a removal", () => {
    const shuffledQ = start(ids, 0, true, "off", reverse);
    const { queue } = removeIds(shuffledQ, new Set(["d"]));
    expect(playOrder(toggleShuffle(queue))).toEqual(["a", "b", "c"]);
  });
});
