import { contentKey } from "./contentKey";
import { isGranted, linkedFile } from "./folders";
import { getTracks, showQuietChanges, storedFile, updateTracks } from "./library";
import { getNowPlaying } from "./player";
import { isIOS } from "./standalone";
import type { Track } from "./types";

const BATCH = 8;
const PAUSE_MS = 5000;

let running: Promise<void> | null = null;
let again = false;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Safari has no requestIdleCallback, so it gets a short timeout instead.
function idle(): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => resolve(), { timeout: 2000 });
    else setTimeout(resolve, 200);
  });
}

// iOS gives a web app little time in the background, and reading files then can stall the audio.
const shouldPause = () => isIOS() && getNowPlaying().playing;

// Linked songs only while their folder is already allowed: reading them otherwise fails, and asking would prompt.
const readable = (t: Track) => !t.contentKey && (t.source.kind === "copied" || isGranted(t.source.folderId));

async function run(): Promise<void> {
  const pending = getTracks().filter(readable);
  for (let i = 0; i < pending.length; ) {
    await idle();
    if (shouldPause()) {
      await wait(PAUSE_MS);
      continue;
    }
    const patches = new Map<string, { contentKey: string }>();
    for (const t of pending.slice(i, i + BATCH)) {
      try {
        const file = t.source.kind === "copied" ? await storedFile(t.id) : await linkedFile(t);
        if (file) patches.set(t.id, { contentKey: await contentKey(file) });
      } catch {
        // Access withdrawn, or the file is gone; a later run tries again.
      }
    }
    i += BATCH;
    if (patches.size) await updateTracks(patches, { quiet: true });
  }
}

// Songs added before content keys existed get one, a few at a time while the app is idle. Each batch is saved as it
// goes, so a reload carries on from where it stopped. A call during a run, as when a folder is allowed, runs it again
// afterwards for the songs that became readable.
export function startContentBackfill(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await run();
    } while (again);
    showQuietChanges();
  })().finally(() => {
    running = null;
  });
  return running;
}
