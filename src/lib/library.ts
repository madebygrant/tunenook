import { useSyncExternalStore } from "react";
import { get, getAll, write, type Write } from "./db";
import { newPlaylist, renamed, withoutTracks, withTracks } from "./playlists";
import { createListeners } from "./store";
import { albumKey } from "./tags";
import type { Album, LinkedFolder, Playlist, Track } from "./types";

// The live set of tracks. The arrays and maps handed to React are snapshots of it, rebuilt on publish.
const store = new Map<string, Track>();
const artUsers = new Map<string, number>();
let tracks: Track[] = [];
let byId = new Map<string, Track>();
let albums: Album[] = [];
let dirty = false;
let playlists: Playlist[] = [];
let folders: LinkedFolder[] = [];
let loaded = false;
let loadError: string | null = null;
const { emit, subscribe } = createListeners();
const removedListeners = new Set<(ids: ReadonlySet<string>) => void>();
const errorListeners = new Set<(message: string) => void>();

function countArt(artId: string | null, delta: number): void {
  if (!artId) return;
  const n = (artUsers.get(artId) ?? 0) + delta;
  if (n > 0) artUsers.set(artId, n);
  else artUsers.delete(artId);
}

function putTrack(track: Track): void {
  countArt(store.get(track.id)?.artId ?? null, -1);
  store.set(track.id, track);
  countArt(track.artId, 1);
  dirty = true;
}

function dropTrack(id: string): void {
  countArt(store.get(id)?.artId ?? null, -1);
  store.delete(id);
  dirty = true;
}

// Rebuilding snapshots is O(n), so bulk imports batch it rather than paying it per file.
function publish(): void {
  if (dirty) {
    tracks = [...store.values()];
    byId = new Map(store);
    albums = groupAlbums(tracks);
    dirty = false;
  }
  emit();
}

let publishTimer: ReturnType<typeof setTimeout> | undefined;

function publishSoon(): void {
  publishTimer ??= setTimeout(() => {
    publishTimer = undefined;
    publish();
  }, 250);
}

function reportError(message: string, e: unknown): void {
  console.error(message, e);
  errorListeners.forEach((listener) => listener(message));
}

export function trackAlbumKey(t: Pick<Track, "albumArtist" | "artist" | "album">): string {
  return albumKey(t.albumArtist || t.artist, t.album || "Unknown album");
}

export function groupAlbums(list: Track[]): Album[] {
  const groups = new Map<string, Album>();
  for (const t of list) {
    const key = trackAlbumKey(t);
    let album = groups.get(key);
    if (!album) {
      album = { key, title: t.album || "Unknown album", artist: t.albumArtist || t.artist, year: t.year, artId: t.artId, tracks: [] };
      groups.set(key, album);
    }
    album.tracks.push(t);
    album.artId ??= t.artId;
    album.year ??= t.year;
  }
  for (const album of groups.values()) album.tracks.sort(byDiscAndTrack);
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function byDiscAndTrack(a: Track, b: Track): number {
  return (a.discNo ?? 1) - (b.discNo ?? 1) || (a.trackNo ?? 1e6) - (b.trackNo ?? 1e6) || a.title.localeCompare(b.title);
}

export async function loadLibrary(): Promise<void> {
  try {
    const [t, p, f] = await Promise.all([getAll<Track>("tracks"), getAll<Playlist>("playlists"), getAll<LinkedFolder>("folders")]);
    t.forEach(putTrack);
    playlists = p.sort((a, b) => a.createdAt - b.createdAt);
    folders = f;
    loaded = true;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Storage is unavailable.";
    throw e;
  } finally {
    publish();
  }
}

export function getTracks(): Track[] {
  return dirty ? [...store.values()] : tracks;
}

export function getTrack(id: string): Track | undefined {
  return store.get(id);
}

export function getPlaylists(): Playlist[] {
  return playlists;
}

export function getFolders(): LinkedFolder[] {
  return folders;
}

export function hasArt(artId: string): boolean {
  return artUsers.has(artId);
}

export function useTracks(): Track[] {
  return useSyncExternalStore(subscribe, () => tracks);
}

export function useTrackMap(): Map<string, Track> {
  return useSyncExternalStore(subscribe, () => byId);
}

export function useAlbums(): Album[] {
  return useSyncExternalStore(subscribe, () => albums);
}

export function usePlaylists(): Playlist[] {
  return useSyncExternalStore(subscribe, () => playlists);
}

export function useFolders(): LinkedFolder[] {
  return useSyncExternalStore(subscribe, () => folders);
}

export function useLibraryLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded);
}

export function useLoadError(): string | null {
  return useSyncExternalStore(subscribe, () => loadError);
}

export function onTracksRemoved(listener: (ids: ReadonlySet<string>) => void): () => void {
  removedListeners.add(listener);
  return () => removedListeners.delete(listener);
}

// Edits made from a tap don't await their write, so failures are announced here instead.
export function onStorageError(listener: (message: string) => void): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

export interface NewTrack {
  track: Track;
  file?: Blob;
  art?: { id: string; blob: Blob };
}

export async function addTrack({ track, file, art }: NewTrack): Promise<void> {
  const writes: Write[] = [{ store: "tracks", op: "put", value: track }];
  if (file) writes.push({ store: "files", op: "put", key: track.id, value: file });
  // Songs from the same album imported before its cover turned up get it now.
  const backfill: Track[] = [];
  if (art) {
    writes.push({ store: "art", op: "put", key: art.id, value: art.blob });
    if (art.id.startsWith("album:")) {
      const key = art.id.slice("album:".length);
      for (const t of store.values()) {
        if (!t.artId && t.album && albumKey(t.albumArtist || t.artist, t.album) === key) backfill.push({ ...t, artId: art.id });
      }
      backfill.forEach((t) => writes.push({ store: "tracks", op: "put", value: t }));
    }
  }
  await write(writes);
  if (art) forgetArt(art.id);
  putTrack(track);
  backfill.forEach(putTrack);
  publishSoon();
}

export async function replaceTrack(track: Track, extra: Write[] = []): Promise<void> {
  await write([...extra, { store: "tracks", op: "put", value: track }]);
  putTrack(track);
  publishSoon();
}

export async function updateTrack(id: string, patch: Partial<Omit<Track, "id">>): Promise<void> {
  const track = store.get(id);
  if (!track) return;
  try {
    await replaceTrack({ ...track, ...patch });
  } catch (e) {
    // Only fills in details such as duration; the next play tries again.
    console.error("Couldn't update song", e);
  }
}

export async function removeTracks(ids: ReadonlySet<string>): Promise<void> {
  if (ids.size === 0) return;
  const now = Date.now();
  const gone = [...ids].map((id) => store.get(id)).filter((t): t is Track => t !== undefined);
  const changed = playlists.map((p) => withoutTracks(p, ids, now));
  const writes: Write[] = [];
  const freedArt = new Map<string, number>();
  for (const t of gone) {
    writes.push({ store: "tracks", op: "delete", key: t.id });
    // Linked tracks have no stored copy; their files on disk are never touched.
    if (t.source.kind === "copied") writes.push({ store: "files", op: "delete", key: t.id });
    if (t.artId) freedArt.set(t.artId, (freedArt.get(t.artId) ?? 0) + 1);
  }
  const unusedArt = [...freedArt].filter(([artId, n]) => (artUsers.get(artId) ?? 0) <= n).map(([artId]) => artId);
  unusedArt.forEach((artId) => writes.push({ store: "art", op: "delete", key: artId }));
  changed.forEach((p, i) => p !== playlists[i] && writes.push({ store: "playlists", op: "put", value: p }));
  await write(writes);
  unusedArt.forEach(forgetArt);
  gone.forEach((t) => dropTrack(t.id));
  playlists = changed;
  publish();
  removedListeners.forEach((listener) => listener(ids));
}

// For taps that don't await: reports instead of rejecting.
export async function removeTracksSafely(ids: ReadonlySet<string>): Promise<void> {
  try {
    await removeTracks(ids);
  } catch (e) {
    reportError("Couldn't remove the song. Nothing was changed.", e);
  }
}

// Memory first, so quick edits build on each other; a failed write puts the old copy back.
export async function savePlaylist(playlist: Playlist): Promise<boolean> {
  const before = playlists.find((p) => p.id === playlist.id);
  playlists = before ? playlists.map((p) => (p.id === playlist.id ? playlist : p)) : [...playlists, playlist];
  emit();
  try {
    await write([{ store: "playlists", op: "put", value: playlist }]);
    return true;
  } catch (e) {
    const current = playlists.find((p) => p.id === playlist.id);
    // A later edit may have landed since; only undo this one if it's still the latest.
    if (current === playlist) {
      playlists = before ? playlists.map((p) => (p.id === playlist.id ? before : p)) : playlists.filter((p) => p.id !== playlist.id);
      emit();
    }
    reportError("Couldn't save the playlist. The change was undone.", e);
    return false;
  }
}

export async function addToPlaylist(id: string, trackIds: string[]): Promise<boolean> {
  const p = playlists.find((x) => x.id === id);
  return p ? savePlaylist(withTracks(p, trackIds, Date.now())) : false;
}

export async function createPlaylist(name: string, trackIds: string[] = []): Promise<Playlist | null> {
  const playlist = newPlaylist(crypto.randomUUID(), name, trackIds, Date.now());
  return (await savePlaylist(playlist)) ? playlist : null;
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const p = playlists.find((x) => x.id === id);
  if (p) await savePlaylist(renamed(p, name, Date.now()));
}

export async function deletePlaylist(id: string): Promise<void> {
  try {
    await write([{ store: "playlists", op: "delete", key: id }]);
  } catch (e) {
    reportError("Couldn't delete the playlist.", e);
    return;
  }
  playlists = playlists.filter((p) => p.id !== id);
  emit();
}

export async function saveFolder(folder: LinkedFolder): Promise<void> {
  await write([{ store: "folders", op: "put", value: folder }]);
  folders = [...folders.filter((f) => f.id !== folder.id), folder];
  emit();
}

export async function deleteFolder(id: string): Promise<void> {
  await write([{ store: "folders", op: "delete", key: id }]);
  folders = folders.filter((f) => f.id !== id);
  emit();
}

export async function storedFile(id: string): Promise<Blob | undefined> {
  return get<Blob>("files", id);
}

const artUrls = new Map<string, Promise<string | null>>();

export function artUrl(artId: string): Promise<string | null> {
  let url = artUrls.get(artId);
  if (!url) {
    url = get<Blob>("art", artId).then((blob) => (blob ? URL.createObjectURL(blob) : null));
    artUrls.set(artId, url);
  }
  return url;
}

function forgetArt(artId: string): void {
  void artUrls.get(artId)?.then((url) => url && URL.revokeObjectURL(url));
  artUrls.delete(artId);
}

// The lock screen gets a data URL: iOS doesn't reliably load blob: URLs for Media Session artwork.
export async function artDataUrl(artId: string): Promise<string | null> {
  const blob = await get<Blob>("art", artId);
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export function totalSeconds(list: Track[]): number {
  return list.reduce((sum, t) => sum + (t.duration ?? 0), 0);
}
