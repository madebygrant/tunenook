import { beforeEach, describe, expect, it, vi } from "vitest";
import { throttledWriter } from "./persist";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

describe("throttledWriter", () => {
  it("writes once per interval no matter how often it is scheduled", () => {
    let value = 0;
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const schedule = throttledWriter("k", () => value, 2000);

    for (let i = 1; i <= 10; i++) {
      value = i;
      schedule();
      vi.advanceTimersByTime(100);
    }
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("k")).toBe("10");
    setItem.mockRestore();
  });

  it("flushes a pending write when the page is hidden", () => {
    let value = 1;
    const schedule = throttledWriter("k", () => value, 2000);
    schedule();
    value = 2;

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(localStorage.getItem("k")).toBe("2");

    vi.advanceTimersByTime(5000);
    expect(localStorage.getItem("k")).toBe("2");
  });

  it("does not write on hide when nothing is pending", () => {
    throttledWriter("k", () => 1, 2000);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(localStorage.getItem("k")).toBeNull();
  });
});
