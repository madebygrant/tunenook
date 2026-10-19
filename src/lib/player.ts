import { useSyncExternalStore } from "react";
import { linkedFile, NeedsAccessError } from "./folders";
import { artDataUrl, getTrack, onTracksRemoved, recordPlay, storedFile, updateTrack } from "./library";
import { publishPlaybackState, publishPosition } from "./mediaSession";
import { throttledWriter } from "./persist";
import { createListenCounter } from "./playCount";
import {
  append as appendQueue,
  currentId,
  cycleRepeat as cycleRepeatQueue,
  EMPTY_QUEUE,
  idAt,
  isValidQueue,
  jump,
  nextAt,
  playNext as playNextQueue,
  prevAt,
  removeIds,
  removePositions,
  start,
  toggleShuffle as toggleShuffleQueue,
  type Queue,
  type Removal,
} from "./queue";
import { createListeners } from "./store";

export const SEEK_SECONDS = 10;
const RESTART_AFTER_SECONDS = 3;
const MAX_SKIPS = 3;
const SAVE_KEY = "tunenook.queue";
const SAVE_INTERVAL_MS = 5000;
const VOLUME_KEY = "tunenook.volume";
const FADE_MS = 10_000;

// "song" stops at the end of whatever song is playing then, so it follows a skip.
export type SleepTimer = { kind: "at"; endsAt: number; minutes: number } | { kind: "song" };

export type Failure = { kind: "error" } | { kind: "access"; folderId: string };

export interface NowPlaying {
  id: string | null;
  playing: boolean;
  // iOS refused play() outside a tap.
  blocked: boolean;
  failure: Failure | null;
}

let audio: HTMLAudioElement | null = null;
let queue: Queue = EMPTY_QUEUE;
let now: NowPlaying = { id: null, playing: false, blocked: false, failure: null };
let position = 0;
let duration = NaN;
let loadedId: string | null = null;
let loadToken = 0;
let pendingSeek = 0;
let unlocked = false;
let skips = 0;
let wantPlay = false;
let silentUrl: string | null = null;
const listens = createListenCounter();
// The song whose audio is on the element. A failed load keeps the old audio playing, and that isn't a play of the new song.
let countingId: string | null = null;
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const { emit, subscribe } = createListeners();
let save: () => void = () => {};
let sleep: SleepTimer | null = null;
let sleepCheck: ReturnType<typeof setTimeout> | undefined;
// Safari's picker for AirPlay speakers and Bluetooth headphones; no other browser lets a page choose its output.
interface RoutableAudio extends HTMLAudioElement {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
}
let wireless = false;
let volume = readVolume();
// What unmuting returns to once the slider has been dragged to 0.
let audible = volume || 1;
// Below 1 only during a sleep timer's fade.
let fade = 1;
let saveVolume: () => void = () => {};

function readVolume(): number {
  try {
    const saved = Number(localStorage.getItem(VOLUME_KEY) ?? "1");
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 0), 1) : 1;
  } catch {
    return 1;
  }
}

function applyVolume(): void {
  if (audio) audio.volume = volume * fade;
}

function setNow(patch: Partial<NowPlaying>): void {
  now = { ...now, ...patch };
  emit();
}

function setQueue(next: Queue): void {
  queue = next;
  emit();
  save();
}

// A 0.1 s silent WAV, played inside a tap so WebKit lets this element play later without one.
function silence(): string {
  if (silentUrl) return silentUrl;
  const samples = 800;
  const buf = new DataView(new ArrayBuffer(44 + samples));
  const text = (at: number, s: string) => [...s].forEach((ch, i) => buf.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  buf.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true);
  buf.setUint16(22, 1, true);
  buf.setUint32(24, 8000, true);
  buf.setUint32(28, 8000, true);
  buf.setUint16(32, 1, true);
  buf.setUint16(34, 8, true);
  text(36, "data");
  buf.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) buf.setUint8(44 + i, 128);
  silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return silentUrl;
}

async function blobFor(id: string): Promise<Blob> {
  const track = getTrack(id);
  if (!track) throw new Error("Track not found");
  if (track.source.kind === "linked") return linkedFile(track);
  const blob = await storedFile(id);
  if (!blob) throw new Error("File missing");
  return blob;
}

// Shares an in-flight load, so a prefetch and a tap on the same song make one object URL, not two.
function prepare(id: string): Promise<string> {
  const cached = urls.get(id);
  if (cached) return Promise.resolve(cached);
  let loading = pending.get(id);
  if (!loading) {
    loading = blobFor(id)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        urls.set(id, url);
        return url;
      })
      .finally(() => pending.delete(id));
    pending.set(id, loading);
  }
  return loading;
}

function neighbours(): Set<string> {
  const keep = new Set<string>();
  const current = currentId(queue);
  if (current) keep.add(current);
  for (const at of [nextAt(queue, true), nextAt(queue, false), prevAt(queue)]) {
    if (at !== null) keep.add(idAt(queue, at));
  }
  return keep;
}

// Keeps the songs either side loaded, so ended, Next and the lock screen switch without an await.
function prefetch(): void {
  const keep = neighbours();
  for (const [id, url] of urls) {
    if (keep.has(id) || id === loadedId) continue;
    URL.revokeObjectURL(url);
    urls.delete(id);
  }
  for (const id of keep) if (!urls.has(id)) void prepare(id).catch(() => {});
}

function play(): void {
  if (!audio) return;
  audio
    .play()
    .then(() => {
      unlocked = true;
    })
    .catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "NotAllowedError") setNow({ blocked: true });
    });
}

function setSource(id: string, url: string, autoplay: boolean, startAt: number): void {
  if (!audio) return;
  loadedId = id;
  pendingSeek = startAt;
  position = Math.floor(startAt);
  duration = getTrack(id)?.duration ?? NaN;
  wantPlay = autoplay;
  listens.reset();
  countingId = id;
  audio.src = url;
  setNow({ id, failure: null, blocked: false });
  if (autoplay) play();
  void publishMetadata(id);
  prefetch();
}

function load(autoplay: boolean, startAt = 0): void {
  const id = currentId(queue);
  const token = ++loadToken;
  countingId = null;
  if (!audio) return;
  if (!id) {
    audio.removeAttribute("src");
    audio.load();
    loadedId = null;
    setNow({ id: null, playing: false, failure: null });
    clearMetadata();
    return;
  }
  const url = urls.get(id);
  if (url) return setSource(id, url, autoplay, startAt);
  if (autoplay && !unlocked) {
    audio.src = silence();
    play();
  }
  setNow({ id, failure: null });
  prepare(id).then(
    (ready) => token === loadToken && setSource(id, ready, autoplay, startAt),
    (e: unknown) => {
      if (token !== loadToken) return;
      loadedId = id;
      const needsAccess = e instanceof NeedsAccessError;
      setNow({ id, playing: false, failure: needsAccess ? { kind: "access", folderId: e.folderId } : { kind: "error" } });
      void publishMetadata(id);
      // Skipping can't fix missing folder access; every later linked song would fail the same way.
      if (autoplay && !needsAccess) skipAfterFailure();
    },
  );
}

async function publishMetadata(id: string): Promise<void> {
  if (!("mediaSession" in navigator)) return;
  const track = getTrack(id);
  if (!track) return;
  const base = { title: track.title, artist: track.artist, album: track.album };
  navigator.mediaSession.metadata = new MediaMetadata(base);
  const art = track.artId ? await artDataUrl(track.artId) : null;
  if (art && currentId(queue) === id) {
    navigator.mediaSession.metadata = new MediaMetadata({ ...base, artwork: [{ src: art, sizes: "512x512", type: "image/jpeg" }] });
  }
}

function clearMetadata(): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = "none";
}

// Playing it again from here is a new play.
function rewindAndStop(): void {
  audio?.pause();
  listens.reset();
  if (audio) audio.currentTime = 0;
}

function advance(auto: boolean): void {
  const at = nextAt(queue, auto);
  if (at === null) return rewindAndStop();
  if (at === queue.at && audio) {
    // Repeat one plays the same load again, and each time round is a play.
    listens.reset();
    audio.currentTime = 0;
    play();
    return;
  }
  setQueue(jump(queue, at));
  load(true);
}

function onEnded(): void {
  skips = 0;
  if (sleep?.kind === "song") {
    setSleepTimer(null);
    // The next song waits, paused, so the morning's Play doesn't repeat the one already heard.
    const at = nextAt(queue, true);
    if (at === null || at === queue.at) return rewindAndStop();
    setQueue(jump(queue, at));
    load(false);
    return;
  }
  advance(true);
}

function clearSleep(): void {
  clearTimeout(sleepCheck);
  sleepCheck = undefined;
  sleep = null;
  fade = 1;
  emit();
}

// Runs on every timeupdate as well as on its own timeout: iOS throttles timers with the screen locked but keeps
// sending timeupdate while audio plays. iOS ignores volume changes, so there it pauses without the fade.
// The volume comes back on the next play, not here, so no buffered audio sounds at full level as it stops.
function checkSleep(): void {
  if (sleep?.kind !== "at") return;
  const left = sleep.endsAt - Date.now();
  if (left <= 0) {
    clearSleep();
    audio?.pause();
    wantPlay = false;
    // A next song still loading would otherwise start by itself once it's ready.
    if (loadedId !== currentId(queue)) load(false);
    return;
  }
  const nextFade = Math.min(1, left / FADE_MS);
  if (nextFade !== fade) {
    fade = nextFade;
    applyVolume();
  }
  sleepCheck ??= setTimeout(
    () => {
      sleepCheck = undefined;
      checkSleep();
    },
    left > FADE_MS ? left - FADE_MS : 250,
  );
}

// Moves past a broken or missing file mid-queue, but gives up after a few so a bad batch doesn't spin.
function skipAfterFailure(): void {
  if (skips >= MAX_SKIPS || nextAt(queue, false) === null) return;
  skips++;
  advance(false);
}

function onError(): void {
  if (!audio || audio.src === silentUrl || !loadedId) return;
  setNow({ playing: false, failure: { kind: "error" } });
  if (wantPlay) skipAfterFailure();
}

export function initPlayer(): void {
  if (audio) return;
  audio = document.createElement("audio");
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  audio.setAttribute("x-webkit-airplay", "allow");
  document.body.appendChild(audio);
  const a = audio;
  applyVolume();

  a.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", () => {
    wireless = (a as RoutableAudio).webkitCurrentPlaybackTargetIsWireless === true;
    emit();
  });

  a.addEventListener("loadedmetadata", () => {
    if (a.src === silentUrl) return;
    if (pendingSeek > 0 && pendingSeek < a.duration) a.currentTime = pendingSeek;
    pendingSeek = 0;
    duration = a.duration;
    if (loadedId && Number.isFinite(a.duration) && getTrack(loadedId)?.duration == null) {
      void updateTrack(loadedId, { duration: Math.round(a.duration) });
    }
    emit();
    publishPosition(a);
  });
  a.addEventListener("durationchange", () => {
    if (a.src === silentUrl) return;
    duration = a.duration;
    emit();
  });
  a.addEventListener("timeupdate", () => {
    if (a.src === silentUrl) return;
    checkSleep();
    if (countingId && listens.observe(a.currentTime, a.duration)) void recordPlay(countingId);
    const next = Math.floor(a.currentTime);
    if (next !== position) {
      position = next;
      emit();
      save();
    }
  });
  a.addEventListener("play", () => {
    if (a.src === silentUrl) return;
    applyVolume();
    setNow({ playing: true, blocked: false });
    publishPlaybackState("playing");
    publishPosition(a);
  });
  a.addEventListener("pause", () => {
    if (a.src === silentUrl) return;
    setNow({ playing: false });
    publishPlaybackState("paused");
    publishPosition(a);
    save();
  });
  a.addEventListener("seeking", listens.jumped);
  a.addEventListener("seeked", () => publishPosition(a));
  a.addEventListener("volumechange", emit);
  a.addEventListener("ended", onEnded);
  a.addEventListener("error", onError);

  if ("mediaSession" in navigator) {
    const session = navigator.mediaSession;
    session.setActionHandler("play", play);
    session.setActionHandler("pause", () => a.pause());
    session.setActionHandler("previoustrack", previous);
    session.setActionHandler("nexttrack", next);
    session.setActionHandler("seekto", (d) => {
      if (d.seekTime !== undefined) seek(d.seekTime);
    });
  }

  saveVolume = throttledWriter(VOLUME_KEY, () => volume, SAVE_INTERVAL_MS);
  save = throttledWriter(SAVE_KEY, () => ({ queue, position: audio?.currentTime ?? position }), SAVE_INTERVAL_MS);
  onTracksRemoved(dropTracks);
}

// Called after the library loads; the restored song waits paused at its last position.
export function restoreQueue(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null") as { queue?: unknown; position?: unknown } | null;
    if (!saved || !isValidQueue(saved.queue) || saved.queue.ids.length === 0) return;
    const missing = new Set(saved.queue.ids.filter((id) => !getTrack(id)));
    const { queue: restored } = removeIds(saved.queue, missing);
    queue = restored;
    emit();
    const position = typeof saved.position === "number" && Number.isFinite(saved.position) ? saved.position : 0;
    load(false, missing.size ? 0 : position);
  } catch {
    // Unreadable save: start with an empty queue.
  }
}

function dropTracks(ids: ReadonlySet<string>): void {
  applyRemoval(removeIds(queue, ids));
}

function applyRemoval({ queue: next, currentRemoved }: Removal): void {
  const wasPlaying = now.playing;
  setQueue(next);
  if (currentRemoved) load(wasPlaying);
  else prefetch();
}

export function playTracks(ids: string[], index: number, options: { shuffle?: boolean } = {}): void {
  if (ids.length === 0) return;
  const shuffle = options.shuffle ?? queue.shuffle;
  const startAt = options.shuffle && index < 0 ? Math.floor(Math.random() * ids.length) : index;
  skips = 0;
  setQueue(start(ids, startAt, shuffle, queue.repeat));
  load(true);
}

export function playNext(ids: string[]): void {
  const wasEmpty = queue.order.length === 0;
  setQueue(playNextQueue(queue, ids));
  if (wasEmpty) load(false);
  else prefetch();
}

export function addToQueue(ids: string[]): void {
  const wasEmpty = queue.order.length === 0;
  setQueue(appendQueue(queue, ids));
  if (wasEmpty) load(false);
  else prefetch();
}

export function jumpTo(at: number): void {
  skips = 0;
  setQueue(jump(queue, at));
  load(true);
}

export function removeFromQueue(positions: number[]): void {
  applyRemoval(removePositions(queue, new Set(positions)));
}

export function clearUpNext(): void {
  const later = new Set<number>();
  for (let pos = queue.at + 1; pos < queue.order.length; pos++) later.add(pos);
  applyRemoval(removePositions(queue, later));
}

export function toggle(): void {
  if (!audio || !now.id) return;
  if (now.failure) return retry();
  if (audio.paused) {
    if (loadedId !== now.id || !audio.src) load(true, position);
    else play();
  } else audio.pause();
}

export function next(): void {
  skips = 0;
  if (nextAt(queue, false) !== null) advance(false);
}

export function previous(): void {
  if (!audio) return;
  const at = prevAt(queue);
  if (audio.currentTime > RESTART_AFTER_SECONDS || at === null) {
    listens.reset();
    seek(0);
    return;
  }
  setQueue(jump(queue, at));
  load(now.playing || !audio.paused);
}

export function seek(seconds: number): void {
  if (!audio || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.min(Math.max(0, seconds), audio.duration);
  position = Math.floor(audio.currentTime);
  emit();
}

export function seekBy(seconds: number): void {
  if (audio) seek(audio.currentTime + seconds);
}

export function toggleMute(): void {
  if (!audio) return;
  if (volume === 0 && !audio.muted) setVolume(audible);
  else audio.muted = !audio.muted;
}

// Moving the slider unmutes, as a hardware volume control would.
export function setVolume(level: number): void {
  volume = Math.min(Math.max(level, 0), 1);
  if (volume > 0) audible = volume;
  applyVolume();
  if (audio && volume > 0) audio.muted = false;
  emit();
  saveVolume();
}

// Minutes from now, "song" for the end of the playing song, or null to cancel.
export function setSleepTimer(choice: number | "song" | null): void {
  clearSleep();
  if (choice !== null) {
    sleep = choice === "song" ? { kind: "song" } : { kind: "at", endsAt: Date.now() + choice * 60_000, minutes: choice };
    emit();
  }
  applyVolume();
  checkSleep();
}

export function toggleShuffle(): void {
  setQueue(toggleShuffleQueue(queue));
  prefetch();
}

export function cycleRepeat(): void {
  setQueue(cycleRepeatQueue(queue));
  prefetch();
}

export function retry(): void {
  const id = currentId(queue);
  if (!id) return;
  skips = 0;
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  load(true, position);
}

export function hasNext(q: Queue): boolean {
  return nextAt(q, false) !== null;
}

export function getQueue(): Queue {
  return queue;
}

export function getNowPlaying(): NowPlaying {
  return now;
}

export function useQueue(): Queue {
  return useSyncExternalStore(subscribe, () => queue);
}

export function useNowPlaying(): NowPlaying {
  return useSyncExternalStore(subscribe, () => now);
}

export function usePosition(): number {
  return useSyncExternalStore(subscribe, () => position);
}

export function isMuted(): boolean {
  return audio?.muted ?? false;
}

export function useMuted(): boolean {
  return useSyncExternalStore(subscribe, isMuted);
}

export function useVolume(): number {
  return useSyncExternalStore(subscribe, () => volume);
}

export function getSleepTimer(): SleepTimer | null {
  return sleep;
}

export function useSleepTimer(): SleepTimer | null {
  return useSyncExternalStore(subscribe, () => sleep);
}

export function canPickOutput(): boolean {
  return typeof (audio as RoutableAudio | null)?.webkitShowPlaybackTargetPicker === "function";
}

// Opens the system list; it has to run inside a tap.
export function pickOutput(): void {
  (audio as RoutableAudio | null)?.webkitShowPlaybackTargetPicker?.();
}

// True while an AirPlay speaker plays the sound instead of this device.
export function useWirelessOutput(): boolean {
  return useSyncExternalStore(subscribe, () => wireless);
}

export function useDuration(): number {
  return useSyncExternalStore(subscribe, () => duration);
}
