import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

const HOLD_MS = 500;
const SLOP_PX = 10;
// The click that ends a long press follows within this; a later click is a new press, even with no pointerdown first.
const SWALLOW_MS = 1000;

// iOS fires no contextmenu on a long press, so a touch is timed by hand. Android and a desktop right-click send
// contextmenu, which opens the same thing. The click that ends a long press is swallowed so it doesn't also play.
export function useLongPress<T>(onLongPress: (item: T) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const firedAt = useRef(-Infinity);
  useEffect(() => () => clearTimeout(timer.current), []);

  const stop = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };

  return (item: T) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      start.current = { x: e.clientX, y: e.clientY };
      stop();
      timer.current = setTimeout(() => {
        timer.current = undefined;
        firedAt.current = Date.now();
        onLongPress(item);
      }, HOLD_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      if (timer.current !== undefined && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > SLOP_PX) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      if (Date.now() - firedAt.current < SWALLOW_MS) return;
      stop();
      firedAt.current = Date.now();
      onLongPress(item);
    },
    // Returns true when the click should be ignored.
    swallowClick: () => {
      const recent = Date.now() - firedAt.current < SWALLOW_MS;
      firedAt.current = -Infinity;
      return recent;
    },
  });
}
