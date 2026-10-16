// Returns a scheduler that writes at most once per interval, and always before the page hides.
export function throttledWriter(key: string, read: () => unknown, intervalMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    localStorage.setItem(key, JSON.stringify(read()));
  }
  const flushIfPending = () => {
    if (timer !== undefined) flush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushIfPending();
  });
  window.addEventListener("pagehide", flushIfPending);

  return () => {
    timer ??= setTimeout(flush, intervalMs);
  };
}
