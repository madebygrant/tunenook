import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPress } from "./useLongPress";
import { useSwipeDown } from "./useSwipeDown";

let root: Root | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  vi.useRealTimers();
});

function mount(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

// jsdom has no PointerEvent or Touch, so the fields React and the hooks read are set by hand.
function fire(el: Element, type: string, fields: Record<string, unknown>) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  act(() => el.dispatchEvent(event));
  return event;
}

function touch(el: Element, type: string, y: number, x = 0, timeStamp = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = type === "touchend" ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperties(event, { touches: { value: touches }, timeStamp: { value: timeStamp } });
  act(() => el.dispatchEvent(event));
  return event;
}

describe("useLongPress", () => {
  function Row({ onHold, onClick }: { onHold: (i: number) => void; onClick: () => void }) {
    const hold = useLongPress(onHold);
    const { swallowClick, ...handlers } = hold(3);
    return (
      <button {...handlers} onClick={() => !swallowClick() && onClick()}>
        Song
      </button>
    );
  }

  it("opens on a held touch and swallows the click that ends it", () => {
    vi.useFakeTimers();
    const onHold = vi.fn();
    const onClick = vi.fn();
    const button = mount(<Row onHold={onHold} onClick={onClick} />).querySelector("button")!;
    fire(button, "pointerdown", { pointerType: "touch", clientX: 0, clientY: 0 });
    act(() => vi.advanceTimersByTime(500));
    expect(onHold).toHaveBeenCalledWith(3);
    fire(button, "pointerup", { pointerType: "touch" });
    act(() => button.click());
    expect(onClick).not.toHaveBeenCalled();
  });

  it("lets a quick tap play, and a scroll cancel the hold", () => {
    vi.useFakeTimers();
    const onHold = vi.fn();
    const onClick = vi.fn();
    const button = mount(<Row onHold={onHold} onClick={onClick} />).querySelector("button")!;
    fire(button, "pointerdown", { pointerType: "touch", clientX: 0, clientY: 0 });
    fire(button, "pointermove", { pointerType: "touch", clientX: 0, clientY: 30 });
    act(() => vi.advanceTimersByTime(600));
    expect(onHold).not.toHaveBeenCalled();
    act(() => button.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("still plays from a later click or Enter after a right-click that had no click after it", () => {
    vi.useFakeTimers();
    const onHold = vi.fn();
    const onClick = vi.fn();
    const button = mount(<Row onHold={onHold} onClick={onClick} />).querySelector("button")!;
    fire(button, "contextmenu", {});
    expect(onHold).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5000));
    act(() => button.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("opens once on contextmenu, so Android's long press doesn't open it twice", () => {
    vi.useFakeTimers();
    const onHold = vi.fn();
    const button = mount(<Row onHold={onHold} onClick={() => {}} />).querySelector("button")!;
    fire(button, "pointerdown", { pointerType: "touch", clientX: 0, clientY: 0 });
    act(() => vi.advanceTimersByTime(500));
    const menu = fire(button, "contextmenu", {});
    expect(menu.defaultPrevented).toBe(true);
    expect(onHold).toHaveBeenCalledTimes(1);
  });
});

describe("useSwipeDown", () => {
  function Sheet({ onSwipe }: { onSwipe: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useSwipeDown(ref, onSwipe);
    return (
      <div ref={ref} className="sheet">
        <input type="range" />
      </div>
    );
  }

  function sheet(onSwipe: () => void) {
    const el = mount(<Sheet onSwipe={onSwipe} />).querySelector<HTMLElement>(".sheet")!;
    Object.defineProperty(el, "offsetHeight", { value: 800 });
    return el;
  }

  it("closes on a long drag down and follows the finger on the way", () => {
    const onSwipe = vi.fn();
    const el = sheet(onSwipe);
    touch(el, "touchstart", 100, 0, 0);
    const move = touch(el, "touchmove", 400, 0, 2000);
    expect(move.defaultPrevented).toBe(true);
    expect(el.style.transform).toBe("translateY(300px)");
    touch(el, "touchend", 400, 0, 2000);
    expect(onSwipe).toHaveBeenCalled();
  });

  it("closes on a short fast flick, and springs back from a short slow drag", () => {
    const onSwipe = vi.fn();
    const el = sheet(onSwipe);
    touch(el, "touchstart", 100, 0, 0);
    touch(el, "touchmove", 160, 0, 1000);
    touch(el, "touchend", 160, 0, 1000);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("");
    touch(el, "touchstart", 100, 0, 0);
    touch(el, "touchmove", 160, 0, 50);
    touch(el, "touchend", 160, 0, 50);
    expect(onSwipe).toHaveBeenCalled();
  });

  it("holds a downward move from the first event, so iOS doesn't start its rubber-band", () => {
    const el = sheet(vi.fn());
    touch(el, "touchstart", 100);
    expect(touch(el, "touchmove", 103).defaultPrevented).toBe(true);
    expect(el.style.transform).toBe("");
    touch(el, "touchstart", 100);
    expect(touch(el, "touchmove", 97).defaultPrevented).toBe(false);
  });

  it("leaves scrolling, sideways drags and the seek bar alone", () => {
    const onSwipe = vi.fn();
    const el = sheet(onSwipe);
    el.scrollTop = 40;
    touch(el, "touchstart", 100);
    expect(touch(el, "touchmove", 400).defaultPrevented).toBe(false);
    el.scrollTop = 0;
    touch(el, "touchstart", 100, 0);
    expect(touch(el, "touchmove", 120, 80).defaultPrevented).toBe(false);
    touch(el.querySelector("input")!, "touchstart", 100);
    expect(touch(el.querySelector("input")!, "touchmove", 400).defaultPrevented).toBe(false);
    touch(el, "touchend", 400);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
