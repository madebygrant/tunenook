import { useEffect, useRef, type RefObject } from "react";

const START_PX = 8;
const FLICK_PX_PER_MS = 0.5;
const FLICK_MIN_PX = 40;

// Touch events rather than pointer events: the sheet still has to scroll, and a pointer drag needs touch-action:
// none to stop the browser cancelling it. A drag only counts from the top of the scroll and when it starts downward.
export function useSwipeDown(ref: RefObject<HTMLElement | null>, onSwipe: (() => void) | undefined): void {
  const latest = useRef(onSwipe);
  useEffect(() => {
    latest.current = onSwipe;
  });
  const enabled = onSwipe !== undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let startX = 0;
    let startY = 0;
    let startAt = 0;
    let dy = 0;
    let tracking = false;
    let dragging = false;

    const settle = () => {
      el.classList.add("is-settling");
      el.style.transform = "";
      el.addEventListener("transitionend", () => el.classList.remove("is-settling"), { once: true });
    };
    const onStart = (e: TouchEvent) => {
      // The seek bar and volume slider are dragged sideways and shouldn't move the sheet.
      tracking = e.touches.length === 1 && el.scrollTop <= 0 && !(e.target instanceof Element && e.target.closest("input"));
      dragging = false;
      dy = 0;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startAt = e.timeStamp;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      dy = e.touches[0].clientY - startY;
      // iOS starts its rubber-band on the first uncancelled move, after which moves can't be cancelled. At the top
      // a mostly-downward move has nothing to scroll, so it's held from the start; upward moves still scroll.
      if (dragging || (dy > 0 && Math.abs(dx) <= dy)) e.preventDefault();
      if (!dragging) {
        if (Math.abs(dx) < START_PX && Math.abs(dy) < START_PX) return;
        if (dy <= 0 || Math.abs(dx) > dy) {
          tracking = false;
          return;
        }
        dragging = true;
        el.classList.remove("is-settling");
      }
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const onEnd = (e: TouchEvent) => {
      if (!dragging) return;
      tracking = dragging = false;
      const flick = dy > FLICK_MIN_PX && dy / Math.max(1, e.timeStamp - startAt) > FLICK_PX_PER_MS;
      if (dy > el.offsetHeight / 4 || flick) latest.current?.();
      else settle();
    };
    const onCancel = () => {
      if (dragging) settle();
      tracking = dragging = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [ref, enabled]);
}
