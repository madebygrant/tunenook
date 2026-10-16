import { announce } from "./announce";
import { getPlaylists, getTrack, savePlaylist } from "./library";
import { moved } from "./playlists";
import type { Playlist } from "./types";

// Rows skip ids whose song has left the library, so row i isn't always playlist position i.
export function visiblePositions(p: Playlist, has: (id: string) => boolean = (id) => getTrack(id) !== undefined): number[] {
  return p.trackIds.flatMap((id, at) => (has(id) ? [at] : []));
}

// Moves by visible row, so a move never lands on a hidden entry, and says where the song went.
export function movePlaylistRow(playlistId: string, fromRow: number, toRow: number): void {
  const p = getPlaylists().find((x) => x.id === playlistId);
  if (!p) return;
  const positions = visiblePositions(p);
  const n = positions.length;
  if (fromRow === toRow || fromRow < 0 || toRow < 0 || fromRow >= n || toRow >= n) return;
  const title = getTrack(p.trackIds[positions[fromRow]])?.title ?? "Song";
  void savePlaylist(moved(p, positions[fromRow], positions[toRow], Date.now()));
  announce(`${title} moved to position ${toRow + 1} of ${n}.`);
}
