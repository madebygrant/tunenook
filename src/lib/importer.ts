import { hasPlaylist, isBackupFile, parseBackup, restoreBackup, type Backup } from "./backup";
import { addTrack, albumCover, createPlaylist, getTracks, hasArt } from "./library";
import { isPlaylistFile, m3uEntries, matchEntries, playlistName, trackPath } from "./m3u";
import { albumKey, guessFromFileName, isAudioFile, sourceKey } from "./tags";
import type { Track, TrackSource } from "./types";

const ART_SIZE = 512;

export interface ImportSummary {
  added: number;
  duplicates: number;
  untagged: number;
  unplayable: string[];
  failed: string[];
  playlists: number;
  missingEntries: number;
  // Songs whose likes, plays and edits came back from a backup.
  restored: number;
  outOfSpace: boolean;
  addedIds: string[];
}

export function emptySummary(): ImportSummary {
  return {
    added: 0,
    duplicates: 0,
    untagged: 0,
    unplayable: [],
    failed: [],
    playlists: 0,
    missingEntries: 0,
    restored: 0,
    outOfSpace: false,
    addedIds: [],
  };
}

export interface Progress {
  done: number;
  total: number;
  current: string;
}

const EXTENSION_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg; codecs=opus",
  webm: "audio/webm",
  caf: "audio/x-caf",
};

export function audioType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase();
  return (ext && EXTENSION_TYPES[ext]) || "";
}

let probe: HTMLAudioElement | null = null;

function mayNotPlay(type: string): boolean {
  if (!type) return false;
  probe ??= document.createElement("audio");
  return probe.canPlayType(type) === "";
}

export async function downscale(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, ART_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}

export interface ReadTrack {
  track: Track;
  art?: { id: string; blob: Blob };
  tagged: boolean;
}

// Tags come from music-metadata, loaded on first import so the app shell stays small.
export async function readTrack(file: File, source: TrackSource, pendingArt: Set<string>): Promise<ReadTrack> {
  const { parseBlob, selectCover } = await import("music-metadata");
  const meta = await parseBlob(file, { duration: false }).catch(() => null);
  const guess = guessFromFileName(file.name);
  const c = meta?.common;
  const artist = c?.artist?.trim() || c?.artists?.[0]?.trim() || guess.artist || "Unknown artist";
  const album = c?.album?.trim() ?? "";
  // Compilations without an album artist would otherwise split into one album per track artist.
  const albumArtist = c?.albumartist?.trim() || (c?.compilation ? "Various artists" : artist);
  const id = crypto.randomUUID();
  const existing = album ? albumCover(albumKey(albumArtist, album)) : null;
  const artId = existing ?? (album ? `album:${albumKey(albumArtist, album)}` : `track:${id}`);

  let art: ReadTrack["art"];
  const cover = selectCover(c?.picture);
  const known = existing !== null || hasArt(artId) || pendingArt.has(artId);
  if (cover && !known) {
    const blob = await downscale(new Blob([cover.data as BlobPart], { type: cover.format }));
    if (blob) {
      art = { id: artId, blob };
      pendingArt.add(artId);
    }
  }

  const duration = meta?.format.duration;
  return {
    tagged: Boolean(c?.title),
    art,
    track: {
      id,
      title: c?.title?.trim() || guess.title,
      artist,
      album,
      albumArtist,
      trackNo: c?.track.no ?? guess.trackNo,
      discNo: c?.disk.no ?? null,
      year: c?.year ?? null,
      duration: duration && Number.isFinite(duration) ? Math.round(duration) : null,
      artId: art || known ? artId : null,
      fileName: file.name,
      path: source.kind === "linked" ? source.path : file.webkitRelativePath || file.name,
      size: file.size,
      type: audioType(file),
      addedAt: Date.now(),
      sourceKey: sourceKey(file),
      source,
    },
  };
}

export interface ImportItem {
  file: File;
  source: TrackSource;
}

// One file at a time keeps memory flat: each file is read, written and released before the next.
export async function importItems(
  items: ImportItem[],
  extras: ExtraFile[],
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const summary = emptySummary();
  const known = new Set(getTracks().map((t) => t.sourceKey));
  const pendingArt = new Set<string>();
  let done = 0;
  for (const { file, source } of items) {
    if (signal?.aborted) break;
    onProgress({ done, total: items.length, current: file.name });
    done++;
    const key = sourceKey(file);
    if (known.has(key)) {
      summary.duplicates++;
      continue;
    }
    try {
      const read = await readTrack(file, source, pendingArt);
      await addTrack({ track: read.track, art: read.art, file: source.kind === "copied" ? file : undefined });
      known.add(key);
      summary.added++;
      summary.addedIds.push(read.track.id);
      if (!read.tagged) summary.untagged++;
      if (mayNotPlay(read.track.type)) summary.unplayable.push(file.name);
    } catch (e) {
      summary.failed.push(file.name);
      // Out of space: every later file would fail the same way.
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        summary.outOfSpace = true;
        break;
      }
    }
  }
  onProgress({ done, total: items.length, current: "" });
  await importExtras(extras, summary);
  return summary;
}

export const isExtraFile = (file: { name: string }) => isPlaylistFile(file) || isBackupFile(file.name);

// Playlists and backups that came with the songs, with their path in the pick.
export interface ExtraFile {
  file: File;
  path: string;
}

const folderOf = (path: string) => path.split("/").slice(0, -1).join("/");

// A TuneNook backup carries its playlists itself, so the .m3u8 copies in its own Playlists folder are skipped.
// Other playlists in the pick are added as usual.
export async function importExtras(files: ExtraFile[], summary: ImportSummary): Promise<void> {
  let latest: { backup: Backup; folder: string } | null = null;
  for (const { file, path } of files.filter((f) => isBackupFile(f.file.name))) {
    const backup = parseBackup(await file.text());
    if (backup && (!latest || backup.exportedAt > latest.backup.exportedAt)) latest = { backup, folder: folderOf(path) };
  }
  if (latest) {
    const result = await restoreBackup(latest.backup, new Set(summary.addedIds));
    summary.restored += result.restored;
    summary.playlists += result.playlists;
    summary.missingEntries += result.missing;
  }
  const copies = latest ? [latest.folder, "Playlists"].filter(Boolean).join("/") : null;
  await importPlaylists(
    files.filter((f) => isPlaylistFile(f.file) && folderOf(f.path) !== copies).map((f) => f.file),
    summary,
  );
}

async function importPlaylists(files: File[], summary: ImportSummary): Promise<void> {
  const fresh = new Set(summary.addedIds);
  const candidates = getTracks().map((t) => ({ id: t.id, path: trackPath(t), fresh: fresh.has(t.id) }));
  for (const file of files) {
    const { ids, missing } = matchEntries(m3uEntries(await file.text()), candidates);
    summary.missingEntries += missing;
    const name = playlistName(file.name);
    // Rescanning a linked folder reads its playlists again; one that's already here as it is isn't added twice.
    if (ids.length === 0 || hasPlaylist(name, ids)) continue;
    if (await createPlaylist(name, ids)) summary.playlists++;
  }
}

// Space a pick will take: files already in the library are skipped as duplicates, so they don't count.
export function bytesToImport(files: { name: string; size: number; type: string }[], tracks: { sourceKey: string }[]): number {
  const known = new Set(tracks.map((t) => t.sourceKey));
  return files.filter((f) => isAudioFile(f) && !known.has(sourceKey(f))).reduce((sum, f) => sum + f.size, 0);
}

export function importFiles(files: File[], onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<ImportSummary> {
  const audio = files.filter(isAudioFile).map((file) => ({ file, source: { kind: "copied" } as const }));
  const extras = files.filter(isExtraFile).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
  return importItems(audio, extras, onProgress, signal);
}
