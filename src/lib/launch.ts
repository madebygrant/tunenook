import { useSyncExternalStore } from "react";
import { contentKey } from "./contentKey";
import { importFiles, readTrack } from "./importer";
import { getJob, runJob } from "./job";
import { addSessionTracks, getTrack, getTracks } from "./library";
import { addToQueue, getNowPlaying, playTracks } from "./player";
import { createListeners } from "./store";
import { describeImport } from "./summary";
import { isAudioFile, sourceKey } from "./tags";

export interface Opened {
  files: File[];
  // Names of files that couldn't be read, at launch or when playing.
  failed: string[];
  busy: boolean;
}

const EMPTY: Opened = { files: [], failed: [], busy: false };
let opened = EMPTY;
const { emit, subscribe } = createListeners();

function set(next: Opened): void {
  opened = next;
  emit();
}

// Set before the first render: Chromium queues launches until a consumer is set. Each launch joins whatever is
// already in the dialog, so a second batch opened before the person chooses isn't lost.
export function listenForLaunch(): void {
  window.launchQueue?.setConsumer(async ({ files }) => {
    const read = await Promise.allSettled(files.map((handle) => handle.getFile()));
    const ok = read.flatMap((r) => (r.status === "fulfilled" && isAudioFile(r.value) ? [r.value] : []));
    const failed = files.filter((_, i) => read[i].status === "rejected").map((handle) => handle.name);
    const seen = new Set(opened.files.map(sourceKey));
    const files2 = [...opened.files, ...ok.filter((f) => !seen.has(sourceKey(f)))];
    if (files2.length || failed.length) set({ files: files2, failed: [...opened.failed, ...failed], busy: false });
  });
}

export function useOpened(): Opened {
  return useSyncExternalStore(subscribe, () => opened);
}

export function dismissOpened(): void {
  set(EMPTY);
}

// A file already in the library plays from there, under its library id. By name and size first, as the importer
// checks, since songs from before content keys may not have one yet.
async function libraryId(file: File, tracks = getTracks()): Promise<string | undefined> {
  const key = sourceKey(file);
  const sameName = tracks.find((t) => t.sourceKey === key);
  if (sameName) return sameName.id;
  const content = await contentKey(file);
  return tracks.find((t) => t.contentKey === content)?.id;
}

async function playable(file: File): Promise<string> {
  const known = await libraryId(file);
  if (known) return known;
  const read = await readTrack(file, { kind: "session" }, new Set());
  addSessionTracks([{ track: read.track, file, art: read.art?.blob }]);
  return read.track.id;
}

// Plays without adding: the files stay in memory until the app closes. The first plays as soon as it's read and
// the rest join the queue in order; files that can't be read are named and skipped.
export async function playOpened(): Promise<void> {
  const { files } = opened;
  set({ ...opened, busy: true });
  const failed: string[] = [];
  let first = 0;
  let started = false;
  for (; first < files.length && !started; first++) {
    try {
      playTracks([await playable(files[first])], 0);
      started = true;
    } catch {
      failed.push(files[first].name);
    }
  }
  const rest = await Promise.allSettled(files.slice(first).map(playable));
  rest.forEach((r, i) => r.status === "rejected" && failed.push(files[first + i].name));
  const ids = rest.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (ids.length) addToQueue(ids);
  if (failed.length) set({ files: [], failed: [...opened.failed, ...failed], busy: false });
  else dismissOpened();
}

// Adds them as an ordinary import and plays them in the order opened, unless something else started playing while
// they were being added.
export function addOpened(): boolean {
  const { files } = opened;
  if (getJob()?.running) return false;
  dismissOpened();
  const before = getNowPlaying().id;
  void runJob("Adding songs", async (onProgress, signal) => {
    const summary = await importFiles(files, onProgress, signal);
    const byName = new Map(summary.copies.map((c) => [c.path, c.id]));
    for (const id of summary.addedIds) {
      const t = getTrack(id);
      if (t) byName.set(t.fileName, id);
    }
    const order = files.flatMap((f) => byName.get(f.name) ?? []);
    const untouched = getNowPlaying().id === before || !getNowPlaying().playing;
    if (order.length && untouched && !signal.aborted) playTracks(order, 0);
    return describeImport(summary);
  });
  return true;
}
