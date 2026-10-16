import { plural } from "./format";
import type { Track } from "./types";

// Shared by the song menu and the selection bar, so the warning reads the same for one song or many.
export function libraryRemovalMessage(tracks: Track[]): string {
  if (tracks.length === 1) {
    return tracks[0].source.kind === "linked"
      ? "This removes the song from TuneNook and its playlists. The file in your folder stays."
      : "This deletes TuneNook's copy of the song and removes it from every playlist. The original file isn't touched.";
  }
  const linked = tracks.filter((t) => t.source.kind === "linked").length;
  const copied = tracks.length - linked;
  const parts: string[] = [];
  if (copied) {
    parts.push(
      `This deletes TuneNook's copies of ${plural(copied, "song")} and removes them from every playlist. The original files aren't touched.`,
    );
  }
  if (linked) {
    parts.push(`This removes ${plural(linked, "linked song")} from TuneNook and its playlists. The files in your folders stay.`);
  }
  return parts.join(" ");
}
