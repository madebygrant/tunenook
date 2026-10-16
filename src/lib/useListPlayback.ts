import { useCallback } from "react";
import { playTracks, toggle, useNowPlaying } from "./player";
import type { Track } from "./types";

// Tapping the loaded song pauses or resumes it; any other row starts the list from there.
export function useListPlayback(tracks: Track[]) {
  const now = useNowPlaying();
  const currentIndex = now.id ? tracks.findIndex((t) => t.id === now.id) : -1;
  const onPlay = useCallback(
    (index: number) => {
      if (tracks[index]?.id === now.id) toggle();
      else playTracks(tracks.map((t) => t.id), index);
    },
    [tracks, now.id],
  );
  return { currentIndex: currentIndex >= 0 ? currentIndex : null, playing: now.playing, onPlay };
}

export function matchesSearch(t: Track, words: string[]): boolean {
  if (words.length === 0) return true;
  const hay = `${t.title} ${t.artist} ${t.album} ${t.albumArtist}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}
