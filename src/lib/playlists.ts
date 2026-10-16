import type { Playlist } from "./types";

export function newPlaylist(id: string, name: string, trackIds: string[], now: number): Playlist {
  return { id, name: name.trim() || "Untitled playlist", trackIds, createdAt: now, updatedAt: now };
}

export function renamed(p: Playlist, name: string, now: number): Playlist {
  return { ...p, name: name.trim() || p.name, updatedAt: now };
}

// Repeats are allowed, as in most players: a song can sit in a playlist twice.
export function withTracks(p: Playlist, ids: string[], now: number): Playlist {
  return { ...p, trackIds: [...p.trackIds, ...ids], updatedAt: now };
}

export function missingFrom(p: Playlist, ids: string[]): string[] {
  const has = new Set(p.trackIds);
  return ids.filter((id) => !has.has(id));
}

export function withoutIndexes(p: Playlist, indexes: ReadonlySet<number>, now: number): Playlist {
  const trackIds = p.trackIds.filter((_, i) => !indexes.has(i));
  return trackIds.length === p.trackIds.length ? p : { ...p, trackIds, updatedAt: now };
}

// Puts removed entries back at their old positions, keeping anything added since; used to undo a removal.
export function withInserted(p: Playlist, entries: [index: number, id: string][], now: number): Playlist {
  const trackIds = [...p.trackIds];
  for (const [index, id] of [...entries].sort((a, b) => a[0] - b[0])) trackIds.splice(Math.min(index, trackIds.length), 0, id);
  return { ...p, trackIds, updatedAt: now };
}

export function withoutTracks(p: Playlist, ids: ReadonlySet<string>, now: number): Playlist {
  const trackIds = p.trackIds.filter((id) => !ids.has(id));
  return trackIds.length === p.trackIds.length ? p : { ...p, trackIds, updatedAt: now };
}

export function moved(p: Playlist, from: number, to: number, now: number): Playlist {
  const n = p.trackIds.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return p;
  const trackIds = [...p.trackIds];
  const [id] = trackIds.splice(from, 1);
  trackIds.splice(to, 0, id);
  return { ...p, trackIds, updatedAt: now };
}
