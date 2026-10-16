export function createListeners(): { emit: () => void; subscribe: (notify: () => void) => () => void } {
  const listeners = new Set<() => void>();
  return {
    emit: () => listeners.forEach((notify) => notify()),
    subscribe(notify) {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
  };
}
