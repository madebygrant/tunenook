const EXTENSION = /\.[a-z0-9]{1,5}$/i;
const LEADING_NUMBER = /^(\d{1,3})[\s._-]+/;

export interface NameGuess {
  title: string;
  artist: string | null;
  trackNo: number | null;
}

// Untagged files are usually named "01 - Artist - Title.mp3", "Artist - Title.mp3" or "01 Title.mp3".
export function guessFromFileName(fileName: string): NameGuess {
  let rest = fileName.replace(EXTENSION, "").replace(/_/g, " ").trim();
  let trackNo: number | null = null;
  const numbered = LEADING_NUMBER.exec(rest);
  if (numbered && numbered[0].length < rest.length) {
    trackNo = Number(numbered[1]);
    rest = rest.slice(numbered[0].length).trim();
  }
  const parts = rest.split(/\s+-\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim(), trackNo };
  return { artist: null, title: rest || fileName, trackNo };
}

export function sourceKey(file: { name: string; size: number }): string {
  return `${file.name}\n${file.size}`;
}

export function albumKey(albumArtist: string, album: string): string {
  return `${albumArtist.toLowerCase()}\n${album.toLowerCase()}`;
}

const AUDIO_EXTENSIONS = /\.(mp3|m4a|m4b|aac|alac|flac|wav|aif|aiff|ogg|oga|opus|webm|caf)$/i;

// Folder picks include cover images and text files; iOS also sends some audio with an empty type.
// Playlists come as audio/x-mpegurl, so they're excluded by name.
export function isAudioFile(file: { name: string; type: string }): boolean {
  if (/\.m3u8?$/i.test(file.name)) return false;
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name);
}
