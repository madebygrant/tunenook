import { write } from "./db";
import type { Track } from "./types";

const WORDS = ["Amber", "Night", "Static", "Harbour", "Glass", "Velvet", "Signal", "Paper", "Echo", "Lantern", "Winter", "Neon"];
const word = (n: number) => WORDS[n % WORDS.length];

// Albums of 10 and three albums per artist, with some songs untagged, so grouping costs what a real library would.
export function fakeTracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => {
    const albumNo = Math.floor(i / 10);
    const artistNo = Math.floor(albumNo / 3);
    const artist = `${word(artistNo)} ${word(artistNo * 7 + 3)} ${artistNo}`;
    const album = i % 50 === 49 ? "" : `${word(albumNo)} ${word(albumNo * 3 + 1)} ${albumNo}`;
    return {
      id: `fake-${i}`,
      title: `${word(i)} ${word(i * 5 + 2)} ${i}`,
      artist,
      album,
      albumArtist: artist,
      trackNo: (i % 10) + 1,
      discNo: null,
      year: 1960 + (albumNo % 65),
      duration: 120 + (i % 240),
      artId: null,
      fileName: `fake-${i}.mp3`,
      size: 0,
      type: "audio/mpeg",
      addedAt: Date.now() - i * 60_000,
      sourceKey: `fake-${i}.mp3\n0`,
      source: { kind: "copied" },
    };
  });
}

// ?fake=10000 adds that many songs with no audio. main.tsx loads this in dev builds only.
export async function seedFromUrl(): Promise<void> {
  const url = new URL(location.href);
  const count = Number(url.searchParams.get("fake"));
  if (!Number.isInteger(count) || count <= 0) return;
  await write(fakeTracks(count).map((value) => ({ store: "tracks", op: "put", value })));
  url.searchParams.delete("fake");
  history.replaceState(history.state, "", url);
}
