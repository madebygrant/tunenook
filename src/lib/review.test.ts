import { describe, expect, it } from "vitest";
import { groupPlays, isPeriod, mostPlayed, mostPlayedEver, periodStart, rankGroups } from "./review";
import { makeTrack } from "./testing";

const play = (trackId: string, at: number) => ({ id: `${trackId}-${at}`, trackId, at });
const DAY = 86_400_000;

describe("mostPlayed", () => {
  it("counts plays since the start and ranks by count, then by latest play", () => {
    const plays = [play("a", 5), play("b", 10), play("a", 20), play("c", 30), play("b", 40), play("old", 1)];
    expect(mostPlayed(plays, 5)).toEqual([
      { key: "b", plays: 2, lastAt: 40 },
      { key: "a", plays: 2, lastAt: 20 },
      { key: "c", plays: 1, lastAt: 30 },
    ]);
  });
});

describe("mostPlayedEver", () => {
  it("ranks songs by their all-time counts, skips unplayed ones, and counts removed songs from the log", () => {
    const tracks = [makeTrack("a", { playCount: 2, lastPlayedAt: 9 }), makeTrack("b"), makeTrack("c", { playCount: 7 })];
    // The log's plays of songs still here are already in their counts.
    const plays = [play("a", 9), play("gone", 3), play("gone", 4), play("gone", 5)];
    expect(mostPlayedEver(tracks, plays)).toEqual([
      { key: "c", plays: 7, lastAt: 0 },
      { key: "gone", plays: 3, lastAt: 5 },
      { key: "a", plays: 2, lastAt: 9 },
    ]);
  });
});

describe("rankGroups", () => {
  it("adds up songs by group and leaves out songs with none", () => {
    const songs = [
      { key: "a", plays: 3, lastAt: 1 },
      { key: "b", plays: 2, lastAt: 8 },
      { key: "c", plays: 4, lastAt: 2 },
      { key: "d", plays: 9, lastAt: 3 },
    ];
    const group: Record<string, string | null> = { a: "x", b: "x", c: "y", d: null };
    expect(rankGroups(songs, (k) => group[k])).toEqual([
      { key: "x", plays: 5, lastAt: 8 },
      { key: "y", plays: 4, lastAt: 2 },
    ]);
  });
});

describe("groupPlays", () => {
  it("credits each song's own artist and its album, skipping unknown artists and untagged albums", () => {
    const songs = {
      a: { artist: "Queen", album: "Jazz", albumArtist: "Queen" },
      b: { artist: "David Bowie", album: "Hot Space", albumArtist: "Queen" },
      c: { artist: "Unknown artist", album: "", albumArtist: "" },
      gone: { artist: "queen", album: "Jazz", albumArtist: "Queen" },
    } as Record<string, { artist: string; album: string; albumArtist: string }>;
    const ranked = [
      { key: "a", plays: 3, lastAt: 1 },
      { key: "b", plays: 2, lastAt: 2 },
      { key: "c", plays: 9, lastAt: 3 },
      { key: "gone", plays: 1, lastAt: 4 },
      { key: "missing", plays: 5, lastAt: 5 },
    ];
    const { artists, albums } = groupPlays(ranked, (id) => songs[id]);
    expect(artists).toEqual([
      { key: "queen", plays: 4, lastAt: 4 },
      { key: "david bowie", plays: 2, lastAt: 2 },
    ]);
    expect(albums).toEqual([
      { key: "jazz", plays: 4, lastAt: 4 },
      { key: "hot space", plays: 2, lastAt: 2 },
    ]);
  });
});

describe("periods", () => {
  it("starts 7 and 30 days back, and a calendar year back for 12 months", () => {
    const now = new Date("2026-03-15T12:00:00").getTime();
    expect(periodStart("7d", now)).toBe(now - 7 * DAY);
    expect(periodStart("30d", now)).toBe(now - 30 * DAY);
    expect(periodStart("12m", now)).toBe(new Date("2025-03-15T12:00:00").getTime());
    expect(isPeriod("12m")).toBe(true);
    expect(isPeriod("forever")).toBe(false);
  });
});
