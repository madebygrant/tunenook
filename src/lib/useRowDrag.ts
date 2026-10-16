import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

const EDGE_PX = 56;
const MAX_SCROLL_PX = 18;

export interface RowDrag {
  from: number;
  to: number;
  // The dragged row's height, which the rows it passes slide by to open a gap.
  height: number;
}

// Song rows are all one height, so the drop point follows from how far the row has moved. Working from the
// offset rather than measured row positions stays exact for rows the browser hasn't laid out yet.
export function dropIndex(count: number, from: number, offset: number, height: number): number {
  if (height <= 0) return from;
  return Math.min(count - 1, Math.max(0, from + Math.round(offset / height)));
}

// Pointer events give mouse and touch one path; the handle sets touch-action: none so a finger drags instead of
// scrolling, and the scroller is moved by hand near its edges. keys identify the rows, so a drop is skipped if the
// list changed under the drag.
export function useRowDrag(list: RefObject<HTMLElement | null>, keys: string[], onReorder: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<RowDrag | null>(null);
  const stopRef = useRef<((commit: boolean) => void) | null>(null);
  const latest = useRef({ keys, onReorder });
  useEffect(() => {
    latest.current = { keys, onReorder };
  });

  const cancel = useCallback(() => stopRef.current?.(false), []);
  useEffect(() => cancel, [cancel]);

  function start(e: ReactPointerEvent<HTMLElement>, from: number) {
    if (e.button !== 0 || !list.current) return;
    const row = list.current.children[from] as HTMLElement | undefined;
    const scroller = list.current.closest<HTMLElement>(".main");
    if (!row || !scroller) return;
    e.preventDefault();
    stopRef.current?.(false);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Already released; the window listeners below still see the rest of the drag.
    }
    const { pointerId } = e;
    const key = latest.current.keys[from];
    const count = latest.current.keys.length;
    const height = row.getBoundingClientRect().height;
    const startY = e.clientY + scroller.scrollTop;
    let pointerY = e.clientY;
    let to = from;
    let frame = 0;

    const update = () => {
      const offset = pointerY + scroller.scrollTop - startY;
      // Written straight to the element, so moving the row doesn't re-render the list; state changes only with the drop point.
      row.style.setProperty("--drag-y", `${offset}px`);
      const next = dropIndex(count, from, offset, height);
      if (next !== to) {
        to = next;
        setDrag({ from, to, height });
      }
    };
    const edgeStep = () => {
      const box = scroller.getBoundingClientRect();
      const above = pointerY - (box.top + EDGE_PX);
      const below = pointerY - (box.bottom - EDGE_PX);
      return above < 0 ? Math.max(above, -EDGE_PX) : below > 0 ? Math.min(below, EDGE_PX) : 0;
    };
    const edgeScroll = () => {
      const step = edgeStep();
      if (!step) {
        frame = 0;
        return;
      }
      scroller.scrollTop += (step / EDGE_PX) * MAX_SCROLL_PX;
      frame = requestAnimationFrame(edgeScroll);
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      pointerY = ev.clientY;
      update();
      if (!frame && edgeStep()) frame = requestAnimationFrame(edgeScroll);
    };
    const onUp = (ev: PointerEvent) => ev.pointerId === pointerId && stop(true);
    const onCancel = (ev: PointerEvent) => ev.pointerId === pointerId && stop(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      stop(false);
    };
    const stop = (commit: boolean) => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      scroller.removeEventListener("scroll", update);
      row.style.removeProperty("--drag-y");
      stopRef.current = null;
      setDrag(null);
      const now = latest.current;
      if (commit && to !== from && now.keys.length === count && now.keys[from] === key) now.onReorder(from, to);
    };
    stopRef.current = stop;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    // Capture phase, so Escape cancels the drag before it reaches anything else, such as select mode.
    window.addEventListener("keydown", onKey, true);
    scroller.addEventListener("scroll", update, { passive: true });
    setDrag({ from, to, height });
  }

  return { drag, start, cancel };
}
