export type Repeat = "off" | "all" | "one";

// order is a permutation of positions in ids, so turning shuffle on or off keeps the current song.
export interface Queue {
  ids: string[];
  order: number[];
  at: number;
  shuffle: boolean;
  repeat: Repeat;
}

export const EMPTY_QUEUE: Queue = { ids: [], order: [], at: 0, shuffle: false, repeat: "off" };

type Rand = () => number;

function shuffled<T>(items: T[], rand: Rand): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// Saved queues come back from localStorage, so check the shape before trusting the indices.
export function isValidQueue(value: unknown): value is Queue {
  if (!value || typeof value !== "object") return false;
  const { ids, order, at, shuffle, repeat } = value as Record<string, unknown>;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return false;
  const n = ids.length;
  if (!Array.isArray(order) || order.length !== n || new Set(order).size !== n) return false;
  if (!order.every((i) => Number.isInteger(i) && i >= 0 && i < n)) return false;
  if (typeof at !== "number" || !Number.isInteger(at) || (n === 0 ? at !== 0 : at < 0 || at >= n)) return false;
  return typeof shuffle === "boolean" && (repeat === "off" || repeat === "all" || repeat === "one");
}

export function currentId(q: Queue): string | null {
  return q.order.length ? q.ids[q.order[q.at]] : null;
}

export function idAt(q: Queue, pos: number): string {
  return q.ids[q.order[pos]];
}

export function start(ids: string[], index: number, shuffle: boolean, repeat: Repeat, rand: Rand = Math.random): Queue {
  if (ids.length === 0) return { ...EMPTY_QUEUE, shuffle, repeat };
  const first = Math.min(Math.max(index, 0), ids.length - 1);
  if (!shuffle) return { ids, order: range(ids.length), at: first, shuffle, repeat };
  const rest = range(ids.length).filter((i) => i !== first);
  return { ids, order: [first, ...shuffled(rest, rand)], at: 0, shuffle, repeat };
}

// auto is true when a song ended by itself; repeat-one only holds then, so Next still moves on.
export function nextAt(q: Queue, auto: boolean): number | null {
  const n = q.order.length;
  if (n === 0) return null;
  if (auto && q.repeat === "one") return q.at;
  if (q.at + 1 < n) return q.at + 1;
  return q.repeat === "off" ? null : 0;
}

export function prevAt(q: Queue): number | null {
  if (q.order.length === 0) return null;
  if (q.at > 0) return q.at - 1;
  return q.repeat === "off" ? null : q.order.length - 1;
}

export function jump(q: Queue, at: number): Queue {
  return at >= 0 && at < q.order.length ? { ...q, at } : q;
}

// Shuffling keeps the current song first and shuffles everything else after it.
export function toggleShuffle(q: Queue, rand: Rand = Math.random): Queue {
  if (q.order.length === 0) return { ...q, shuffle: !q.shuffle };
  const current = q.order[q.at];
  if (q.shuffle) return { ...q, shuffle: false, order: range(q.ids.length), at: current };
  const rest = range(q.ids.length).filter((i) => i !== current);
  return { ...q, shuffle: true, order: [current, ...shuffled(rest, rand)], at: 0 };
}

export function cycleRepeat(q: Queue): Queue {
  const repeat: Repeat = q.repeat === "off" ? "all" : q.repeat === "all" ? "one" : "off";
  return { ...q, repeat };
}

export function playNext(q: Queue, ids: string[]): Queue {
  if (q.order.length === 0) return start(ids, 0, false, q.repeat);
  const added = ids.map((_, i) => q.ids.length + i);
  const order = [...q.order.slice(0, q.at + 1), ...added, ...q.order.slice(q.at + 1)];
  return { ...q, ids: [...q.ids, ...ids], order };
}

export function append(q: Queue, ids: string[]): Queue {
  if (q.order.length === 0) return start(ids, 0, false, q.repeat);
  const added = ids.map((_, i) => q.ids.length + i);
  return { ...q, ids: [...q.ids, ...ids], order: [...q.order, ...added] };
}

// Drops ids no position points at and renumbers the rest, keeping the original list order for unshuffling.
function compact(q: Queue, order: number[], at: number): Queue {
  const kept = [...new Set(order)].sort((a, b) => a - b);
  const renumber = new Map(kept.map((old, i) => [old, i]));
  return {
    ...q,
    ids: kept.map((i) => q.ids[i]),
    order: order.map((old) => renumber.get(old)!),
    at: Math.min(Math.max(at, 0), Math.max(0, order.length - 1)),
  };
}

export interface Removal {
  queue: Queue;
  currentRemoved: boolean;
}

export function removePositions(q: Queue, positions: ReadonlySet<number>): Removal {
  const kept: number[] = [];
  let before = 0;
  for (let pos = 0; pos < q.order.length; pos++) {
    if (positions.has(pos)) {
      if (pos < q.at) before++;
    } else kept.push(q.order[pos]);
  }
  const currentRemoved = positions.has(q.at);
  // A removed current song hands over to the one after it.
  return { queue: compact(q, kept, q.at - before), currentRemoved };
}

export function removeIds(q: Queue, ids: ReadonlySet<string>): Removal {
  const positions = new Set<number>();
  q.order.forEach((i, pos) => {
    if (ids.has(q.ids[i])) positions.add(pos);
  });
  return removePositions(q, positions);
}
