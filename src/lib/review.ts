import { artistKey, trackAlbumKey } from "./library";
import { UNKNOWN_ARTIST } from "./tags";
import type { Play, Track } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Period = "7d" | "30d" | "12m" | "all";

export const PERIODS: { value: Period; label: string; heading: string }[] = [
  { value: "7d", label: "7 days", heading: "Last 7 days" },
  { value: "30d", label: "30 days", heading: "Last 30 days" },
  { value: "12m", label: "12 months", heading: "Last 12 months" },
  { value: "all", label: "All time", heading: "All time" },
];

export function isPeriod(value: unknown): value is Period {
  return PERIODS.some((p) => p.value === value);
}

export function periodStart(period: Exclude<Period, "all">, now: number): number {
  if (period === "7d") return now - 7 * DAY_MS;
  if (period === "30d") return now - 30 * DAY_MS;
  const date = new Date(now);
  date.setFullYear(date.getFullYear() - 1);
  return date.getTime();
}

export interface Ranked {
  key: string;
  plays: number;
  lastAt: number;
}

const byPlays = (a: Ranked, b: Ranked) => b.plays - a.plays || b.lastAt - a.lastAt;

// Songs by plays since a time, from the dated log. A tie goes to the song played most recently.
export function mostPlayed(plays: readonly Play[], since: number): Ranked[] {
  const byTrack = new Map<string, Ranked>();
  for (const p of plays) {
    if (p.at < since) continue;
    const ranked = byTrack.get(p.trackId);
    if (ranked) {
      ranked.plays++;
      ranked.lastAt = Math.max(ranked.lastAt, p.at);
    } else byTrack.set(p.trackId, { key: p.trackId, plays: 1, lastAt: p.at });
  }
  return [...byTrack.values()].sort(byPlays);
}

// Songs by their all-time counts, which include plays from before the log started or past its two years.
// Removed songs lose their count, so their logged plays stand in.
export function mostPlayedEver(tracks: readonly Track[], plays: readonly Play[]): Ranked[] {
  const inLibrary = new Set(tracks.map((t) => t.id));
  const counted = tracks
    .filter((t) => (t.playCount ?? 0) > 0)
    .map((t) => ({ key: t.id, plays: t.playCount!, lastAt: t.lastPlayedAt ?? 0 }));
  const removed = mostPlayed(
    plays.filter((p) => !inLibrary.has(p.trackId)),
    -Infinity,
  );
  return [...counted, ...removed].sort(byPlays);
}

// Adds up ranked songs into groups such as artists or albums. Songs groupOf returns null for are left out.
export function rankGroups(songs: readonly Ranked[], groupOf: (songKey: string) => string | null): Ranked[] {
  const groups = new Map<string, Ranked>();
  for (const s of songs) {
    const key = groupOf(s.key);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) {
      group.plays += s.plays;
      group.lastAt = Math.max(group.lastAt, s.lastAt);
    } else groups.set(key, { ...s, key });
  }
  return [...groups.values()].sort(byPlays);
}

type SongInfo = Pick<Track, "artist" | "album" | "albumArtist">;

const unknownArtist = artistKey(UNKNOWN_ARTIST);

// Artists by each song's own artist, so guests on a compilation get credit; songs with no artist tag are left
// out. Albums leave out songs with no album tag. songOf also finds removed songs, so their plays still count.
export function groupPlays(songs: readonly Ranked[], songOf: (id: string) => SongInfo | undefined): { artists: Ranked[]; albums: Ranked[] } {
  return {
    artists: rankGroups(songs, (id) => {
      const song = songOf(id);
      const key = song ? artistKey(song.artist) : null;
      return key === unknownArtist ? null : key;
    }),
    albums: rankGroups(songs, (id) => {
      const song = songOf(id);
      return song?.album ? trackAlbumKey(song) : null;
    }),
  };
}
