import { useLayoutEffect, useRef, useState, type RefObject } from "react";

// Shorter lists render whole, which keeps find-in-page working where it costs nothing.
export const WINDOW_FROM = 200;
const OVERSCAN = 12;
// Snapping the range to steps of rows means scrolling re-renders every few rows, not every row.
const STEP = 8;
const FIRST_PAINT = 40;

export interface Range {
  start: number;
  end: number;
}

// listTop is where the list starts within the scroller's content; rows are all rowHeight tall.
export function rowRange(count: number, rowHeight: number, listTop: number, scrollTop: number, viewHeight: number): Range {
  if (rowHeight <= 0) return { start: 0, end: Math.min(count, FIRST_PAINT) };
  const first = Math.floor((scrollTop - listTop) / rowHeight) - OVERSCAN;
  const last = Math.ceil((scrollTop + viewHeight - listTop) / rowHeight) + OVERSCAN;
  const start = Math.max(0, Math.min(Math.floor(first / STEP), Math.floor((count - 1) / STEP)) * STEP);
  const end = Math.min(count, Math.max(start, Math.ceil(last / STEP) * STEP));
  return { start, end };
}

export type Run = { from: number; to: number };

// The range plus rows that must stay mounted, such as the focused or dragged row, as sorted runs of indexes.
export function rowRuns(count: number, range: Range, pinned: (number | null | undefined)[]): Run[] {
  const runs: Run[] = range.end > range.start ? [{ from: range.start, to: range.end }] : [];
  for (const i of pinned) {
    if (i === null || i === undefined || i < 0 || i >= count) continue;
    if (runs.some((r) => i >= r.from && i < r.to)) continue;
    runs.push({ from: i, to: i + 1 });
  }
  runs.sort((a, b) => a.from - b.from);
  return runs.reduce<Run[]>((merged, r) => {
    const last = merged.at(-1);
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
    return merged;
  }, []);
}

// The page scrolls in .main, so that is what the rows are measured against.
export function useRowWindow(list: RefObject<HTMLElement | null>, count: number, enabled: boolean) {
  const [state, setState] = useState<Range & { rowHeight: number }>({ start: 0, end: Math.min(count, FIRST_PAINT), rowHeight: 0 });
  // Kept between measures: an empty range mounts no row to measure.
  const measured = useRef(0);

  // Before paint, so a list that opens scrolled down doesn't show a frame of empty space.
  useLayoutEffect(() => {
    const el = list.current;
    const scroller = el?.closest<HTMLElement>(".main");
    if (!enabled || !el || !scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Fractional, as the drag measures it; rounded heights drift a row off over a few hundred rows.
      const row = el.querySelector<HTMLElement>(":scope > .song");
      if (row) measured.current = row.getBoundingClientRect().height || measured.current;
      const rowHeight = measured.current;
      const listTop = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const next = rowRange(count, rowHeight, listTop, scroller.scrollTop, scroller.clientHeight);
      setState((prev) =>
        prev.start === next.start && prev.end === next.end && prev.rowHeight === rowHeight ? prev : { ...next, rowHeight },
      );
    };
    // At most one measure per frame, however many scroll events arrive.
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", schedule, { passive: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(scroller);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", schedule);
      resize.disconnect();
    };
  }, [list, count, enabled]);

  return state;
}
