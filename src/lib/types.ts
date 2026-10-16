export type TrackSource = { kind: "copied" } | { kind: "linked"; folderId: string; path: string };

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
  source: TrackSource;
}

export interface LinkedFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  addedAt: number;
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
