import { useSyncExternalStore } from "react";
import { plural } from "./format";
import { downscale } from "./importer";
import { getAlbums, isUntaggedGroup, setTracksArt } from "./library";
import { createListeners } from "./store";
import type { Album } from "./types";

// Off unless the person turns it on: this is the only thing in TuneNook that talks to another server.
const SETTING_KEY = "tunenook.artLookup";
// Albums MusicBrainz had no cover for, by key, with when they were asked about, so a bulk run doesn't resend them.
const MISSES_KEY = "tunenook.artLookupMisses";
const RETRY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const { emit, subscribe } = createListeners();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: lasts until reload.
  }
}

let enabled = read(SETTING_KEY) === "1";

// Another window turning it off stops lookups here too.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== SETTING_KEY && e.key !== null) return;
    enabled = read(SETTING_KEY) === "1";
    emit();
  });
}

export function isArtLookupOn(): boolean {
  return enabled;
}

export function useArtLookup(): boolean {
  return useSyncExternalStore(subscribe, () => enabled);
}

export function setArtLookup(on: boolean): void {
  enabled = on;
  write(SETTING_KEY, on ? "1" : null);
  emit();
}

export class LookupOffError extends Error {
  constructor() {
    super("Online artwork lookup is off.");
  }
}

// No connection, or blocked: every later album would fail the same way.
export class OfflineError extends Error {
  constructor(service: string) {
    super(`Couldn't reach ${service}. Check the connection and try again.`);
  }
}

class ServiceError extends Error {
  constructor(service: string, status: number) {
    super(`${service} couldn't answer just now (${status}). Try again later.`);
  }
}

// MusicBrainz allows one request a second from each client.
const GAP_MS = 1100;
let nextSlot = 0;

async function musicBrainz(url: string, signal?: AbortSignal): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + GAP_MS;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  return lookup(url, "MusicBrainz", signal);
}

// Every request goes through here, so turning the setting off stops them all.
async function lookup(url: string, service: string, signal?: AbortSignal): Promise<Response> {
  if (!enabled) throw new LookupOffError();
  try {
    return await fetch(url, { signal, referrerPolicy: "no-referrer", credentials: "omit" });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new OfflineError(service);
  }
}

// Lucene query syntax: quoted phrases, so only quotes and backslashes need escaping.
const phrase = (text: string) => `"${text.replace(/[\\"]/g, "\\$&")}"`;

export function releaseSearchUrl(title: string, artist: string): string {
  const query = `release:${phrase(title)} AND artist:${phrase(artist)}`;
  return `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
}

interface Release {
  id: string;
  score?: number;
  "release-group"?: { id: string };
}

// The best few matches, then their release groups, since a group's cover often stands in for a release with none.
// A cover that fails moves on to the next; if none is found and one failed, that failure is what's reported.
export async function findCover(title: string, artist: string, signal?: AbortSignal): Promise<Blob | null> {
  const response = await musicBrainz(releaseSearchUrl(title, artist), signal);
  if (!response.ok) throw new ServiceError("MusicBrainz", response.status);
  const { releases = [] } = (await response.json()) as { releases?: Release[] };
  const good = releases.filter((r) => (r.score ?? 0) >= 80);
  const groups = [...new Set(good.flatMap((r) => r["release-group"]?.id ?? []))];
  const covers = [
    ...good.map((r) => `https://coverartarchive.org/release/${r.id}/front-500`),
    ...groups.map((id) => `https://coverartarchive.org/release-group/${id}/front-500`),
  ];
  let failure: Error | null = null;
  for (const url of covers) {
    try {
      const cover = await lookup(url, "the Cover Art Archive", signal);
      if (cover.ok && cover.headers.get("content-type")?.startsWith("image/")) return await cover.blob();
      if (cover.status !== 404) failure ??= new ServiceError("The Cover Art Archive", cover.status);
    } catch (e) {
      if (e instanceof LookupOffError || signal?.aborted) throw e;
      failure ??= e instanceof Error ? e : new Error(String(e));
    }
  }
  if (failure) throw failure;
  return null;
}

function misses(): Record<string, number> {
  try {
    return JSON.parse(read(MISSES_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function noteMiss(key: string, missed: boolean): void {
  const all = misses();
  if (missed) all[key] = Date.now();
  else delete all[key];
  write(MISSES_KEY, JSON.stringify(all));
}

export function needsArt(album: Album): boolean {
  return !album.artId && !isUntaggedGroup(album);
}

// Albums a bulk run would ask about: no art, and not already asked about lately without a match.
export function albumsToLookUp(albums: Album[]): Album[] {
  const missed = misses();
  const cutoff = Date.now() - RETRY_AFTER_MS;
  return albums.filter((a) => needsArt(a) && !((missed[a.key] ?? 0) > cutoff));
}

export type LookupResult = "found" | "none" | "has-art" | "not-saved";

// Saved against the album's songs only if they still have no cover, so art set by hand meanwhile stays.
export async function findAlbumArt(album: Album, signal?: AbortSignal): Promise<LookupResult> {
  const found = await findCover(album.title, album.artist, signal);
  noteMiss(album.key, !found);
  const blob = found && (await downscale(found));
  if (!blob) return "none";
  const result = await setTracksArt(
    album.tracks.map((t) => t.id),
    blob,
    { ifMissing: true },
  );
  return result === "saved" ? "found" : result === "has-art" ? "has-art" : "not-saved";
}

export async function findMissingArt(onProgress: (p: { done: number; total: number; current: string }) => void, signal: AbortSignal): Promise<string> {
  const albums = albumsToLookUp(getAlbums());
  if (albums.length === 0) return "No albums to look up.";
  let found = 0;
  let failed = 0;
  let checked = 0;
  let stoppedBy: string | null = null;
  for (const album of albums) {
    if (signal.aborted) break;
    onProgress({ done: checked, total: albums.length, current: album.title });
    try {
      if ((await findAlbumArt(album, signal)) === "found") found++;
      checked++;
    } catch (e) {
      if (signal.aborted) break;
      if (e instanceof LookupOffError || e instanceof OfflineError) {
        stoppedBy = e.message;
        break;
      }
      checked++;
      failed++;
    }
  }
  onProgress({ done: checked, total: albums.length, current: "" });
  const parts = checked ? [`Found artwork for ${found} of ${plural(checked, "album")} checked.`] : [];
  if (checked < albums.length) parts.push(`Stopped with ${plural(albums.length - checked, "album")} left.`);
  if (stoppedBy) parts.push(stoppedBy);
  if (failed) parts.push(`${plural(failed, "album")} couldn't be looked up; try again later.`);
  return parts.join(" ");
}
