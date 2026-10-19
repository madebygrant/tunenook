import { isUntaggedGroup } from "./library";
import type { Album, Play, Playlist, RemovedSong, Track } from "./types";

export type PartKey = "audio" | "art" | "details" | "history" | "other";

export interface Part {
  key: PartKey;
  label: string;
  // Null when it couldn't be measured.
  bytes: number | null;
}

export interface UsageInput {
  tracks: readonly Track[];
  playlists: readonly Playlist[];
  plays: readonly Play[];
  removed: ReadonlyMap<string, RemovedSong>;
  // Null when the artwork couldn't be read.
  artBytes: number | null;
  // What the browser reports for the whole site, or null where it can't tell.
  usage: number | null;
}

const encoder = new TextEncoder();

// The database's own size per record isn't exposed, so records are measured as the JSON they'd be.
function jsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

export function audioBytes(tracks: readonly Track[]): number {
  return tracks.reduce((n, t) => (t.source.kind === "copied" ? n + t.size : n), 0);
}

// Always in this order, so each part keeps its place and colour in the chart. Other is whatever the browser counts
// beyond the rest: the app's own files, database overhead and space not yet reclaimed.
export function usageParts({ tracks, playlists, plays, removed, artBytes, usage }: UsageInput): Part[] {
  const parts: Part[] = [
    { key: "audio", label: "Songs", bytes: audioBytes(tracks) },
    { key: "art", label: "Artwork", bytes: artBytes },
    { key: "details", label: "Song details and playlists", bytes: jsonBytes(tracks) + jsonBytes(playlists) },
    { key: "history", label: "Play history", bytes: jsonBytes(plays) + jsonBytes([...removed.values()]) },
  ];
  // With a part unmeasured, the rest of the total can't be told apart from it, so there's no overhead part.
  const known = parts.reduce((n, p) => (n === null || p.bytes === null ? null : n + p.bytes), 0 as number | null);
  if (known !== null && usage !== null && usage > known) {
    parts.push({ key: "other", label: "App and browser overhead", bytes: usage - known });
  }
  return parts;
}

// Whole percents, but a sliver never reads as 0% and a near-whole never reads as 100%.
export function share(bytes: number, total: number): string {
  if (total === 0 || bytes === 0) return "0%";
  const pct = (bytes / total) * 100;
  if (pct < 1) return "<1%";
  if (pct < 100 && Math.round(pct) === 100) return ">99%";
  return `${Math.round(pct)}%`;
}

export interface Sized<T> {
  item: T;
  bytes: number;
}

// Only copies TuneNook holds count; songs in linked folders take no space here. Songs with no album tag aren't
// an album, so they're left out, as on the Albums page.
export function largestAlbums(albums: readonly Album[], limit: number): Sized<Album>[] {
  return albums
    .filter((album) => !isUntaggedGroup(album))
    .map((album) => ({ item: album, bytes: audioBytes(album.tracks) }))
    .filter((a) => a.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

export function largestSongs(tracks: readonly Track[], limit: number): Sized<Track>[] {
  return tracks
    .filter((t) => t.source.kind === "copied" && t.size > 0)
    .map((t) => ({ item: t, bytes: t.size }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

// What each playlist's songs take up. A song in several playlists counts toward each, but once per playlist.
export function playlistSizes(playlists: readonly Playlist[], byId: ReadonlyMap<string, Track>): Sized<Playlist>[] {
  return playlists
    .map((p) => {
      const songs = [...new Set(p.trackIds)].flatMap((id) => byId.get(id) ?? []);
      return { item: p, bytes: audioBytes(songs) };
    })
    .sort((a, b) => b.bytes - a.bytes);
}
