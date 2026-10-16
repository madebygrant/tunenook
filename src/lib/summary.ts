import { plural } from "./format";
import type { ImportSummary } from "./importer";

function names(list: string[]): string {
  const shown = list.slice(0, 3).join(", ");
  return list.length > 3 ? `${shown} and ${list.length - 3} more` : shown;
}

export function describeImport(s: ImportSummary): string {
  const parts = [s.added ? `Added ${plural(s.added, "song")}.` : "No new songs."];
  if (s.duplicates) parts.push(`${plural(s.duplicates, "song")} ${s.duplicates === 1 ? "was" : "were"} already here.`);
  if (s.playlists) parts.push(`Made ${plural(s.playlists, "playlist")}.`);
  if (s.missingEntries) parts.push(`${plural(s.missingEntries, "playlist entry", "playlist entries")} didn't match a song.`);
  if (s.untagged) parts.push(`${plural(s.untagged, "song")} had no tags, so names come from the file names.`);
  if (s.unplayable.length) parts.push(`May not play on this device: ${names(s.unplayable)}.`);
  if (s.failed.length) parts.push(`Couldn't add ${names(s.failed)}.`);
  return parts.join(" ");
}
