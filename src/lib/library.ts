import { useSyncExternalStore } from "react";
import { get, getAll, write, type Write } from "./db";
import { newPlaylist, renamed, withoutTracks, withTracks } from "./playlists";
import { createListeners } from "./store";
import { albumKey } from "./tags";
import type { Album, LinkedFolder, Playlist, Track } from "./types";

let tracks: Track[] = [];
let byId = new Map<string, Track>();
let playlists: Playlist[] = [];
let folders: LinkedFolder[] = [];
let albums: Album[] = [];
let loaded = false;
const { emit, subscribe } = createListeners();
const removedListeners = new Set<(ids: ReadonlySet<string>) => void>();

function setTracks(next: Track[]): void {
  tracks = next;
  byId = new Map(next.map((t) => [t.id, t]));
  albums = groupAlbums(next);
}

export function groupAlbums(list: Track[]): Album[] {
  const groups = new Map<string, Album>();
  for (const t of list) {
    const artist = t.albumArtist || t.artist;
    const title = t.album || "Unknown album";
    const key = albumKey(artist, title);
    let album = groups.get(key);
    if (!album) {
      album = { key, title, artist, year: t.year, artId: t.artId, tracks: [] };
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
  const [t, p, f] = await Promise.all([getAll<Track>("tracks"), getAll<Playlist>("playlists"), getAll<LinkedFolder>("folders")]);
  setTracks(t);
  playlists = p.sort((a, b) => a.createdAt - b.createdAt);
  folders = f;
  loaded = true;
  emit();
}

let emitTimer: ReturnType<typeof setTimeout> | undefined;

// Bulk imports add one track at a time; re-rendering every list per file would stall a big import.
function emitSoon(): void {
  emitTimer ??= setTimeout(() => {
    emitTimer = undefined;
    emit();
  }, 250);
}

export function getTracks(): Track[] {
  return tracks;
}

export function getTrack(id: string): Track | undefined {
  return byId.get(id);
}

export function getPlaylists(): Playlist[] {
  return playlists;
}

export function getFolders(): LinkedFolder[] {
  return folders;
}

export function hasArt(artId: string): boolean {
  return tracks.some((t) => t.artId === artId);
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

export function onTracksRemoved(listener: (ids: ReadonlySet<string>) => void): () => void {
  removedListeners.add(listener);
  return () => removedListeners.delete(listener);
}

export interface NewTrack {
  track: Track;
  file?: Blob;
  art?: { id: string; blob: Blob };
}

export async function addTrack({ track, file, art }: NewTrack): Promise<void> {
  const writes: Write[] = [{ store: "tracks", op: "put", value: track }];
  if (file) writes.push({ store: "files", op: "put", key: track.id, value: file });
  if (art) writes.push({ store: "art", op: "put", key: art.id, value: art.blob });
  await write(writes);
  if (art) forgetArt(art.id);
  setTracks([...tracks, track]);
  emitSoon();
}

export async function replaceTrack(track: Track, extra: Write[] = []): Promise<void> {
  await write([...extra, { store: "tracks", op: "put", value: track }]);
  setTracks(tracks.map((t) => (t.id === track.id ? track : t)));
  emitSoon();
}

export async function updateTrack(id: string, patch: Partial<Omit<Track, "id">>): Promise<void> {
  const track = byId.get(id);
  if (track) await replaceTrack({ ...track, ...patch });
}

export async function removeTracks(ids: ReadonlySet<string>): Promise<void> {
  if (ids.size === 0) return;
  const now = Date.now();
  const gone = tracks.filter((t) => ids.has(t.id));
  const kept = tracks.filter((t) => !ids.has(t.id));
  const keptArt = new Set(kept.map((t) => t.artId));
  const changed = playlists.map((p) => withoutTracks(p, ids, now));
  const writes: Write[] = [];
  for (const t of gone) {
    writes.push({ store: "tracks", op: "delete", key: t.id });
    // Linked tracks have no stored copy; their files on disk are never touched.
    if (t.source.kind === "copied") writes.push({ store: "files", op: "delete", key: t.id });
    if (t.artId && !keptArt.has(t.artId)) {
      writes.push({ store: "art", op: "delete", key: t.artId });
      keptArt.add(t.artId);
      forgetArt(t.artId);
    }
  }
  changed.forEach((p, i) => p !== playlists[i] && writes.push({ store: "playlists", op: "put", value: p }));
  await write(writes);
  setTracks(kept);
  playlists = changed;
  emit();
  removedListeners.forEach((listener) => listener(ids));
}

// Memory first, so quick successive edits each build on the last one.
export async function savePlaylist(playlist: Playlist): Promise<void> {
  const exists = playlists.some((p) => p.id === playlist.id);
  playlists = exists ? playlists.map((p) => (p.id === playlist.id ? playlist : p)) : [...playlists, playlist];
  emit();
  await write([{ store: "playlists", op: "put", value: playlist }]);
}

export async function addToPlaylist(id: string, trackIds: string[]): Promise<void> {
  const p = playlists.find((x) => x.id === id);
  if (p) await savePlaylist(withTracks(p, trackIds, Date.now()));
}

export async function createPlaylist(name: string, trackIds: string[] = []): Promise<Playlist> {
  const playlist = newPlaylist(crypto.randomUUID(), name, trackIds, Date.now());
  await savePlaylist(playlist);
  return playlist;
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const p = playlists.find((x) => x.id === id);
  if (p) await savePlaylist(renamed(p, name, Date.now()));
}

export async function deletePlaylist(id: string): Promise<void> {
  await write([{ store: "playlists", op: "delete", key: id }]);
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
