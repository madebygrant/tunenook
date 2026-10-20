import { useSyncExternalStore } from "react";
import { startContentBackfill } from "./contentBackfill";
import { contentKey } from "./contentKey";
import { importItems, isExtraFile, type ImportSummary, type Progress } from "./importer";
import { deleteFolder, getFolders, getTracks, patchTrack, removeTracks, saveFolder } from "./library";
import type { Write } from "./db";
import { slimAudio } from "./slim";
import { createListeners } from "./store";
import { isAudioFile } from "./tags";
import type { LinkedFolder, Track } from "./types";

export const canLinkFolders = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

// Granted folder ids. Chromium grants last only for the session, so this starts empty on every launch.
const granted = new Set<string>();
const { emit, subscribe } = createListeners();

export function isGranted(folderId: string): boolean {
  return granted.has(folderId);
}

export function useGranted(folderId: string | null): boolean {
  return useSyncExternalStore(subscribe, () => (folderId ? granted.has(folderId) : true));
}

export class NeedsAccessError extends Error {
  readonly folderId: string;
  constructor(folderId: string) {
    super("Folder access needed");
    this.folderId = folderId;
  }
}

function folderOf(track: Track): LinkedFolder | undefined {
  return track.source.kind === "linked" ? getFolders().find((f) => f.id === (track.source as { folderId: string }).folderId) : undefined;
}

export async function checkAccess(folder: LinkedFolder): Promise<boolean> {
  const ok = (await folder.handle.queryPermission({ mode: "read" })) === "granted";
  if (ok !== granted.has(folder.id)) {
    if (ok) granted.add(folder.id);
    else granted.delete(folder.id);
    emit();
  }
  return ok;
}

// Must run inside a tap: Chromium only shows the permission prompt with user activation.
export async function requestAccess(folderId: string): Promise<boolean> {
  const folder = getFolders().find((f) => f.id === folderId);
  if (!folder) return false;
  const ok = (await folder.handle.requestPermission({ mode: "read" })) === "granted";
  if (ok) granted.add(folder.id);
  emit();
  if (ok) void startContentBackfill();
  return ok;
}

export async function checkAllAccess(): Promise<void> {
  await Promise.all(getFolders().map((f) => checkAccess(f).catch(() => false)));
}

async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: { path: string; handle: FileSystemFileHandle }[]) {
  for await (const entry of dir.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") await walk(entry as FileSystemDirectoryHandle, path, out);
    else out.push({ path, handle: entry as FileSystemFileHandle });
  }
}

export async function linkedFile(track: Track): Promise<File> {
  if (track.source.kind !== "linked") throw new Error("Not a linked track");
  const folder = folderOf(track);
  if (!folder) throw new Error("Folder no longer linked");
  if (!(await checkAccess(folder))) throw new NeedsAccessError(folder.id);
  const parts = track.source.path.split("/");
  let dir = folder.handle;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
  return (await dir.getFileHandle(parts[parts.length - 1])).getFile();
}

export async function linkFolder(onProgress: (p: Progress) => void): Promise<ImportSummary | null> {
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker!({ id: "tunenook-music", mode: "read" });
  } catch {
    return null;
  }
  const folder: LinkedFolder = { id: crypto.randomUUID(), name: handle.name, handle, addedAt: Date.now() };
  await saveFolder(folder);
  granted.add(folder.id);
  emit();
  return scanFolder(folder, onProgress);
}

// Adds files that are new since the last scan and drops tracks whose file is gone.
export async function scanFolder(folder: LinkedFolder, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<ImportSummary> {
  const found: { path: string; handle: FileSystemFileHandle }[] = [];
  await walk(folder.handle, "", found);
  const linked = getTracks().filter((t) => t.source.kind === "linked" && t.source.folderId === folder.id);
  const linkedPaths = new Set(linked.map((t) => (t.source as { path: string }).path));
  const foundPaths = new Set(found.map((f) => f.path));

  const ids = new Set(getTracks().map((t) => t.id));
  // A known copy is skipped unread while the song it copies is still here.
  const copies = Object.fromEntries(Object.entries(folder.copies ?? {}).filter(([path, id]) => foundPaths.has(path) && ids.has(id)));
  const audio = found.filter((f) => isAudioFile({ name: f.handle.name, type: "" }) && !linkedPaths.has(f.path) && !copies[f.path]);
  const items = [];
  for (const f of audio) items.push({ file: await f.handle.getFile(), source: { kind: "linked" as const, folderId: folder.id, path: f.path } });
  const extras = await Promise.all(
    found.filter((f) => isExtraFile({ name: f.handle.name })).map(async (f) => ({ file: await f.handle.getFile(), path: f.path })),
  );
  const missing = linked.filter((t) => !foundPaths.has((t.source as { path: string }).path));
  const summary = await importItems(items, extras, onProgress, signal, missing);

  for (const c of summary.copies) copies[c.path] = c.id;
  if (JSON.stringify(copies) !== JSON.stringify(folder.copies ?? {})) await saveFolder({ ...folder, copies });
  // A stopped scan never reached some files, so a missing song may just be one it didn't get to as a move.
  if (signal?.aborted || summary.outOfSpace) return summary;
  const moved = new Set(summary.movedIds);
  await removeTracks(new Set(missing.filter((t) => !moved.has(t.id)).map((t) => t.id)));
  return summary;
}

export async function unlinkFolder(folderId: string): Promise<void> {
  const ids = getTracks().filter((t) => t.source.kind === "linked" && t.source.folderId === folderId).map((t) => t.id);
  await removeTracks(new Set(ids));
  await deleteFolder(folderId);
  granted.delete(folderId);
  emit();
}

export class NotEnoughSpaceError extends Error {
  readonly needed: number;
  readonly available: number;
  constructor(needed: number, available: number) {
    super("Not enough space");
    this.needed = needed;
    this.available = available;
  }
}

export interface CopyResult {
  copied: number;
  failed: string[];
  stoppedForSpace: boolean;
}

// Copies linked files into IndexedDB under the same track id, so playlists and the queue are untouched.
export async function copyIntoLibrary(
  tracks: Track[],
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<CopyResult> {
  const todo = tracks.filter((t) => t.source.kind === "linked");
  const needed = todo.reduce((sum, t) => sum + t.size, 0);
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (estimate?.quota !== undefined && estimate.usage !== undefined && needed > estimate.quota - estimate.usage) {
    throw new NotEnoughSpaceError(needed, estimate.quota - estimate.usage);
  }
  const result: CopyResult = { copied: 0, failed: [], stoppedForSpace: false };
  for (const [i, track] of todo.entries()) {
    if (signal?.aborted) break;
    onProgress({ done: i, total: todo.length, current: track.fileName });
    try {
      const file = await linkedFile(track);
      // Keyed from the original first, so the file on disk is still known as this song's after the cover goes.
      const key = track.contentKey ?? (await contentKey(file));
      const stored = (track.artId && (await slimAudio(file))) || file;
      const extra: Write[] = [{ store: "files", op: "put", key: track.id, value: stored }];
      // Skipped when the song was removed while its file was read.
      if (await patchTrack(track.id, { source: { kind: "copied" }, size: stored.size, contentKey: key }, extra)) {
        result.copied++;
      }
    } catch (e) {
      if (e instanceof NeedsAccessError) throw e;
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        result.stoppedForSpace = true;
        break;
      }
      result.failed.push(track.fileName);
    }
  }
  onProgress({ done: todo.length, total: todo.length, current: "" });
  return result;
}
