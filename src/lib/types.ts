// session: opened with the installed app and played without adding; held in memory until the app closes.
export type TrackSource = { kind: "copied" } | { kind: "linked"; folderId: string; path: string } | { kind: "session" };

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  duration: number | null;
  artId: string | null;
  fileName: string;
  // Path within the picked folder, used to match .m3u entries; just the file name for single-file picks.
  path?: string;
  size: number;
  type: string;
  addedAt: number;
  // Matches files picked again, so a re-import skips them.
  sourceKey: string;
  // Matches the same file under another name. Songs from before it existed get it filled in later.
  contentKey?: string;
  source: TrackSource;
  playCount?: number;
  lastPlayedAt?: number;
  // Set while the song is liked, so Liked songs can list the latest first.
  likedAt?: number;
}

export interface LinkedFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  addedAt: number;
  // Files skipped as copies of a song already in the library, by path, with that song's id, so rescans skip them
  // without reading them while that song is still here.
  copies?: Record<string, string>;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Album {
  key: string;
  title: string;
  artist: string;
  year: number | null;
  artId: string | null;
  tracks: Track[];
}

export interface Artist {
  key: string;
  name: string;
  artId: string | null;
  albums: Album[];
  // Albums by another album artist, such as compilations, with at least one song by this artist.
  appearsOn: Album[];
  // Songs with no album tag.
  songs: Track[];
  // Every song by this artist: own albums oldest first, then appearances, then songs with no album.
  tracks: Track[];
}
