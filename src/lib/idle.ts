import { getNowPlaying } from "./player";
import { isIOS } from "./standalone";

export const PAUSE_MS = 5000;

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Safari has no requestIdleCallback, so it gets a short timeout instead.
export function idle(): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => resolve(), { timeout: 2000 });
    else setTimeout(resolve, 200);
  });
}

// iOS gives a web app little time in the background, and reading files then can stall the audio.
export const shouldPause = () => isIOS() && getNowPlaying().playing;

// Waits for an idle moment, and on iOS for the song playing to stop.
export async function breather(): Promise<void> {
  await idle();
  while (shouldPause()) await wait(PAUSE_MS);
}
