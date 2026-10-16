export const COUNT_AFTER_SECONDS = 30;

export interface ListenCounter {
  reset: () => void;
  // Seeks are reported, not guessed from big steps: time updates can be seconds apart on a locked phone.
  jumped: () => void;
  // True once per reset, when the song has been heard for half its length or 30 seconds.
  observe: (time: number, duration: number) => boolean;
}

export function createListenCounter(): ListenCounter {
  let heard = 0;
  let last: number | null = null;
  let counted = false;
  return {
    reset() {
      heard = 0;
      last = null;
      counted = false;
    },
    jumped() {
      last = null;
    },
    observe(time, duration) {
      if (last !== null && time > last) heard += time - last;
      last = time;
      if (counted) return false;
      const needed = Number.isFinite(duration) && duration > 0 ? Math.min(COUNT_AFTER_SECONDS, duration / 2) : COUNT_AFTER_SECONDS;
      counted = heard >= needed;
      return counted;
    },
  };
}
