import { hasPlaylist, isBackupFile, parseBackup, restoreBackup, type Backup } from "./backup";
import { contentKey } from "./contentKey";
import { addTrack, albumCover, createPlaylist, getTracks, hasArt, patchTrack, trackAlbumKey } from "./library";
import { isPlaylistFile, m3uEntries, matchEntries, playlistName, trackPath } from "./m3u";
import { slimAudio } from "./slim";
import { guessFromFileName, isAudioFile, sourceKey, UNKNOWN_ARTIST } from "./tags";
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
  // Picked files skipped as copies of songs already here, so playlists naming them still find the song.
  copies: { path: string; id: string }[];
  // Linked songs found at a new path in their folder and moved there.
  movedIds: string[];
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
    copies: [],
    movedIds: [],
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
  const artist = c?.artist?.trim() || c?.artists?.[0]?.trim() || guess.artist || UNKNOWN_ARTIST;
  const album = c?.album?.trim() ?? "";
  // Compilations without an album artist would otherwise split into one album per track artist.
  const albumArtist = c?.albumartist?.trim() || (c?.compilation ? "Various artists" : artist);
  const id = crypto.randomUUID();
  const existing = album ? albumCover(trackAlbumKey({ albumArtist, artist, album })) : null;
  const artId = existing ?? (album ? `album:${trackAlbumKey({ albumArtist, artist, album })}` : `track:${id}`);

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

const itemPath = ({ file, source }: ImportItem) => (source.kind === "linked" ? source.path : file.webkitRelativePath || file.name);

// One file at a time keeps memory flat: each file is read, written and released before the next. missing are
// linked songs whose file has gone from its path; one found again under a new path is moved there, not re-added.
export async function importItems(
  items: ImportItem[],
  extras: ExtraFile[],
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
  missing: Track[] = [],
): Promise<ImportSummary> {
  const summary = emptySummary();
  const lost = new Set(missing.map((t) => t.id));
  const present = getTracks().filter((t) => !lost.has(t.id));
  const bySource = new Map(present.map((t) => [t.sourceKey, t.id]));
  const byContent = new Map(present.flatMap((t) => (t.contentKey ? [[t.contentKey, t.id] as const] : [])));
  const movable = new Map(missing.map((t) => [t.contentKey ?? t.sourceKey, t]));
  const pendingArt = new Set<string>();
  let done = 0;
  for (const item of items) {
    const { file, source } = item;
    if (signal?.aborted) break;
    onProgress({ done, total: items.length, current: file.name });
    done++;
    const key = sourceKey(file);
    const sameName = bySource.get(key);
    if (sameName) {
      summary.duplicates++;
      summary.copies.push({ path: itemPath(item), id: sameName });
      continue;
    }
    let read: ReadTrack | undefined;
    try {
      // Checked after the name, since this reads part of the file.
      const content = await contentKey(file);
      const copyOf = byContent.get(content);
      if (copyOf) {
        summary.duplicates++;
        summary.copies.push({ path: itemPath(item), id: copyOf });
        continue;
      }
      const moved = source.kind === "linked" ? (movable.get(content) ?? movable.get(key)) : undefined;
      if (moved && source.kind === "linked") {
        movable.delete(moved.contentKey ?? moved.sourceKey);
        await patchTrack(moved.id, { source, path: source.path, fileName: file.name, sourceKey: key, contentKey: content });
        summary.movedIds.push(moved.id);
        bySource.set(key, moved.id);
        byContent.set(content, moved.id);
        continue;
      }
      read = await readTrack(file, source, pendingArt);
      read.track.contentKey = content;
      // A song with a saved cover doesn't need the one in its file. Without one, a cover that couldn't be read
      // stays in the file, the only copy of it.
      const slim = source.kind === "copied" && read.track.artId ? await slimAudio(file) : null;
      const stored = source.kind === "copied" ? (slim ?? file) : undefined;
      if (stored) read.track.size = stored.size;
      await addTrack({ track: read.track, art: read.art, file: stored });
      bySource.set(key, read.track.id);
      byContent.set(content, read.track.id);
      summary.added++;
      summary.addedIds.push(read.track.id);
      if (!read.tagged) summary.untagged++;
      if (mayNotPlay(read.track.type)) summary.unplayable.push(file.name);
    } catch (e) {
      // A cover that never got saved mustn't stand in for the album's next song, or that song's own copy is stripped.
      if (read?.art) pendingArt.delete(read.art.id);
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
    const result = await restoreBackup(latest.backup, new Set(summary.addedIds), summary.copies);
    summary.restored += result.restored;
    summary.playlists += result.playlists;
    summary.missingEntries += result.missing;
  }
  const backupCopies = latest ? [latest.folder, "Playlists"].filter(Boolean).join("/") : null;
  await importPlaylists(
    files.filter((f) => isPlaylistFile(f.file) && folderOf(f.path) !== backupCopies).map((f) => f.file),
    summary,
  );
}

async function importPlaylists(files: File[], summary: ImportSummary): Promise<void> {
  const fresh = new Set(summary.addedIds);
  const candidates = [
    ...getTracks().map((t) => ({ id: t.id, path: trackPath(t), fresh: fresh.has(t.id) })),
    ...summary.copies.map((c) => ({ id: c.id, path: c.path, fresh: true })),
  ];
  for (const file of files) {
    const { ids, missing } = matchEntries(m3uEntries(await file.text()), candidates);
    summary.missingEntries += missing;
    const name = playlistName(file.name);
    // Rescanning a linked folder reads its playlists again; one that's already here as it is isn't added twice.
    if (ids.length === 0 || hasPlaylist(name, ids)) continue;
    if (await createPlaylist(name, ids)) summary.playlists++;
  }
}

// Most space a pick can take. Files already here under the same name are left out; renamed copies can only be
// spotted by reading them, so they're counted.
export function importSize(
  files: { name: string; size: number; type: string }[],
  tracks: { sourceKey: string }[],
): { songs: number; bytes: number } {
  const known = new Set(tracks.map((t) => t.sourceKey));
  const fresh = files.filter((f) => isAudioFile(f) && !known.has(sourceKey(f)));
  return { songs: fresh.length, bytes: fresh.reduce((sum, f) => sum + f.size, 0) };
}

export function importFiles(files: File[], onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<ImportSummary> {
  const audio = files.filter(isAudioFile).map((file) => ({ file, source: { kind: "copied" } as const }));
  const extras = files.filter(isExtraFile).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
  return importItems(audio, extras, onProgress, signal);
}
