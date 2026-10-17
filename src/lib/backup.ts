import { contentKey } from "./contentKey";
import { safeFileName } from "./download";
import { plural } from "./format";
import { createPlaylist, editTracks, getPlaylists, getTracks, storedFile, updateTracks, type TagEdit } from "./library";
import type { Progress } from "./importer";
import { toM3u, trackPath } from "./m3u";
import { names } from "./summary";
import type { Playlist, Track } from "./types";
import { zip } from "./zip";

export const BACKUP_FILE = "tunenook-backup.json";

// Later backups into the same folder get " (2)" and so on, since existing files are never overwritten.
export function isBackupFile(name: string): boolean {
  return /^tunenook-backup( \(\d+\))?\.json$/i.test(name);
}

const TAGS = ["title", "artist", "album", "albumArtist", "trackNo", "discNo", "year"] as const;

export interface BackupTrack extends Required<TagEdit> {
  // Where the file is relative to the backup folder if it was written there, else where it was first picked from.
  path: string;
  size: number;
  copied: boolean;
  addedAt: number;
  likedAt?: number;
  playCount?: number;
  lastPlayedAt?: number;
}

export interface Backup {
  app: "tunenook";
  version: 1;
  exportedAt: number;
  tracks: BackupTrack[];
  playlists: { name: string; paths: string[] }[];
}

function withNumber(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
}

// Paths for the songs about to be written. Songs picked one at a time are all at the top level, so names can
// repeat; later ones get a number.
export function backupPaths(tracks: Track[]): Map<string, string> {
  const taken = new Set<string>();
  const paths = new Map<string, string>();
  for (const t of tracks) {
    const segments = trackPath(t).split("/").filter(Boolean).map(safeFileName);
    const name = segments.pop() ?? safeFileName(t.fileName);
    const folder = segments.join("/");
    let path = folder ? `${folder}/${name}` : name;
    for (let n = 2; taken.has(path.toLowerCase()); n++) path = folder ? `${folder}/${withNumber(name, n)}` : withNumber(name, n);
    taken.add(path.toLowerCase());
    paths.set(t.id, path);
  }
  return paths;
}

// written maps the songs saved into the backup folder to where they went; the rest keep the path they came from.
export function buildBackup(tracks: Track[], playlists: Playlist[], written: ReadonlyMap<string, string>, now: number): Backup {
  const pathOf = (t: Track) => written.get(t.id) ?? trackPath(t);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return {
    app: "tunenook",
    version: 1,
    exportedAt: now,
    tracks: tracks.map((t) => ({
      ...Object.fromEntries(TAGS.map((k) => [k, t[k]])),
      path: pathOf(t),
      size: t.size,
      copied: t.source.kind === "copied",
      addedAt: t.addedAt,
      likedAt: t.likedAt,
      playCount: t.playCount,
      lastPlayedAt: t.lastPlayedAt,
    })) as BackupTrack[],
    playlists: playlists.map((p) => ({
      name: p.name,
      paths: p.trackIds.flatMap((id) => {
        const t = byId.get(id);
        return t ? [pathOf(t)] : [];
      }),
    })),
  };
}

// Plain .m3u8 copies of the playlists for other players, from Playlists/ one level below the songs.
export function playlistFiles(backup: Backup): { name: string; text: string }[] {
  const byPath = new Map(backup.tracks.map((t) => [t.path, t]));
  const taken = new Set<string>();
  return backup.playlists.map((p) => {
    const base = safeFileName(`${p.name}.m3u8`);
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = withNumber(base, n);
    taken.add(name.toLowerCase());
    const entries = p.paths.flatMap((path) => {
      const t = byPath.get(path);
      return t ? [{ path: `../${path}`, title: t.title, artist: t.artist, duration: null }] : [];
    });
    return { name, text: toM3u(entries) };
  });
}

export function parseBackup(text: string): Backup | null {
  try {
    const data = JSON.parse(text) as Partial<Backup>;
    if (data.app !== "tunenook" || data.version !== 1 || !Array.isArray(data.tracks) || !Array.isArray(data.playlists)) return null;
    return data as Backup;
  } catch {
    return null;
  }
}

export interface RestorePlan {
  tags: Map<string, TagEdit>;
  stats: Map<string, Partial<Track>>;
  playlists: { name: string; ids: string[]; missing: number }[];
}

const segments = (path: string) => path.toLowerCase().split("/").filter(Boolean);

// One path must end the other, so a folder picked a level higher or lower still matches, but a same-named file in
// another album doesn't.
function samePlace(a: string[], b: string[]): boolean {
  const n = Math.min(a.length, b.length);
  return n > 0 && a.slice(-n).every((s, i) => s === b.slice(-n)[i]);
}

// Only songs added by this import get their likes, plays and edits back; songs already here keep their own. The size
// must match too, since names like "Track 01.mp3" repeat. copies are picked files skipped as copies of songs already
// here, found under the picked path. Playlists come back only when the pick held some of the backup's songs, so
// rescanning a linked folder that holds a backup does nothing.
export function restorePlan(
  backup: Backup,
  tracks: Track[],
  fresh: ReadonlySet<string>,
  copies: { path: string; id: string }[] = [],
): RestorePlan {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const places = [
    ...tracks.map((t) => ({ path: trackPath(t), track: t })),
    ...copies.flatMap((c) => {
      const track = byId.get(c.id);
      return track ? [{ path: c.path, track }] : [];
    }),
  ];
  const byName = new Map<string, { path: string; track: Track }[]>();
  for (const place of places) {
    const name = segments(place.path).at(-1);
    if (name) byName.set(name, [...(byName.get(name) ?? []), place]);
  }
  const copied = new Set(copies.map((c) => c.path));
  let picked = 0;
  const idByPath = new Map<string, string>();
  const plan: RestorePlan = { tags: new Map(), stats: new Map(), playlists: [] };
  for (const saved of backup.tracks) {
    const want = segments(saved.path);
    const options = (byName.get(want.at(-1) ?? "") ?? []).filter(
      (o) => samePlace(want, segments(o.path)) && (!saved.size || !o.track.size || saved.size === o.track.size),
    );
    const match = options.find((o) => fresh.has(o.track.id) || copied.has(o.path)) ?? options[0];
    if (!match) continue;
    const t = match.track;
    idByPath.set(saved.path, t.id);
    if (fresh.has(t.id) || copied.has(match.path)) picked++;
    if (!fresh.has(t.id) || plan.stats.has(t.id)) continue;
    const changed = TAGS.filter((k) => saved[k] !== undefined && saved[k] !== t[k]);
    if (changed.length) plan.tags.set(t.id, Object.fromEntries(changed.map((k) => [k, saved[k]])));
    plan.stats.set(t.id, { addedAt: saved.addedAt, likedAt: saved.likedAt, playCount: saved.playCount, lastPlayedAt: saved.lastPlayedAt });
  }
  if (picked === 0) return plan;
  for (const p of backup.playlists) {
    const found = p.paths.flatMap((path) => idByPath.get(path) ?? []);
    plan.playlists.push({ name: p.name, ids: found, missing: p.paths.length - found.length });
  }
  return plan;
}

// Restoring the same backup twice, or a playlist file that matches one already here, shouldn't make a copy.
export function hasPlaylist(name: string, ids: string[]): boolean {
  return getPlaylists().some((p) => p.name === name && p.trackIds.join() === ids.join());
}

export async function restoreBackup(
  backup: Backup,
  fresh: ReadonlySet<string>,
  copies: { path: string; id: string }[] = [],
): Promise<{ restored: number; playlists: number; missing: number }> {
  const plan = restorePlan(backup, getTracks(), fresh, copies);
  if (plan.tags.size) await editTracks(plan.tags);
  if (plan.stats.size) await updateTracks(plan.stats, { now: true, failure: "Couldn't restore likes and play counts." });
  let playlists = 0;
  let missing = 0;
  for (const p of plan.playlists) {
    missing += p.missing;
    if (p.ids.length === 0 || hasPlaylist(p.name, p.ids)) continue;
    if (await createPlaylist(p.name, p.ids)) playlists++;
  }
  return { restored: plan.stats.size, playlists, missing };
}

async function existing(dir: FileSystemDirectoryHandle, name: string): Promise<File | null> {
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

// The same test the importer uses for a renamed copy, without reading the whole file back.
async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  return a.size === b.size && (await contentKey(a)) === (await contentKey(b));
}

// Never overwrites. A matching file already there is left as it is; anything else gets the next free number.
async function writeNew(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: Blob,
  matches: (file: File) => Promise<boolean>,
): Promise<{ name: string; written: boolean }> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : withNumber(name, n);
    const current = await existing(dir, candidate);
    if (current && (await matches(current))) return { name: candidate, written: false };
    if (current) continue;
    const writable = await (await dir.getFileHandle(candidate, { create: true })).createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch (e) {
      // The handle created an empty file; a failed write shouldn't leave it behind.
      await writable.abort().catch(() => {});
      await dir.removeEntry(candidate).catch(() => {});
      throw e;
    }
    return { name: candidate, written: true };
  }
}

// Songs share folders, so each folder handle is looked up once.
function folders(root: FileSystemDirectoryHandle) {
  const cache = new Map<string, Promise<FileSystemDirectoryHandle>>([["", Promise.resolve(root)]]);
  const at = (path: string[]): Promise<FileSystemDirectoryHandle> => {
    const key = path.join("/");
    let dir = cache.get(key);
    if (!dir) {
      dir = at(path.slice(0, -1)).then((parent) => parent.getDirectoryHandle(path[path.length - 1], { create: true }));
      cache.set(key, dir);
    }
    return dir;
  };
  return at;
}

async function newestBackup(root: FileSystemDirectoryHandle): Promise<Backup | null> {
  let newest: Backup | null = null;
  for await (const entry of root.values()) {
    if (entry.kind !== "file" || !isBackupFile(entry.name)) continue;
    const backup = parseBackup(await (await (entry as FileSystemFileHandle).getFile()).text());
    if (backup && (!newest || backup.exportedAt > newest.exportedAt)) newest = backup;
  }
  return newest;
}

const undated = (b: Backup) => JSON.stringify({ ...b, exportedAt: 0 });

// Writes each copied song, the backup file and copies of the playlists into a folder the person picks. A song
// already there is left alone, so backing up to the same folder again only writes what's new.
export async function backupToFolder(onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<string | null> {
  let root: FileSystemDirectoryHandle;
  try {
    root = await window.showDirectoryPicker!({ id: "tunenook-backup", mode: "readwrite" });
  } catch {
    return null;
  }
  const folderAt = folders(root);
  const tracks = getTracks();
  const copied = tracks.filter((t) => t.source.kind === "copied");
  const planned = backupPaths(copied);
  const written = new Map<string, string>();
  const failed = new Set<string>();
  let wrote = 0;
  for (const [i, t] of copied.entries()) {
    if (signal?.aborted) return `Wrote ${plural(wrote, "song")} before stopping. No backup file was written, so back up again to finish.`;
    onProgress({ done: i, total: copied.length, current: t.title });
    try {
      const blob = await storedFile(t.id);
      if (!blob) throw new Error("No stored copy");
      const parts = planned.get(t.id)!.split("/");
      const name = parts.pop()!;
      const result = await writeNew(await folderAt(parts), name, blob, (file) => sameBytes(file, blob));
      written.set(t.id, [...parts, result.name].join("/"));
      if (result.written) wrote++;
    } catch {
      failed.add(t.id);
    }
  }
  onProgress({ done: copied.length, total: copied.length, current: "" });

  // Songs that couldn't be written are left out, so a restore can't pin their details on some other file.
  const kept = tracks.filter((t) => !failed.has(t.id));
  const backup = buildBackup(kept, getPlaylists(), written, Date.now());
  const latest = await newestBackup(root);
  let backupName: string | null = null;
  if (!latest || undated(latest) !== undated(backup)) {
    // Never matches, so a changed backup always gets a new file and stays the newest one a restore picks.
    const saved = await writeNew(root, BACKUP_FILE, new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" }), async () => false);
    backupName = saved.name;
  }
  const playlistFailures: string[] = [];
  for (const file of playlistFiles(backup)) {
    try {
      await writeNew(await folderAt(["Playlists"]), file.name, new Blob([file.text]), async (f) => (await f.text()) === file.text);
    } catch {
      playlistFailures.push(file.name);
    }
  }

  const parts = [`Backed up to ${root.name}: wrote ${plural(wrote, "song")}.`];
  const already = copied.length - wrote - failed.size;
  if (already) parts.push(`${plural(already, "song")} ${already === 1 ? "was" : "were"} already there.`);
  const linked = tracks.length - copied.length;
  if (linked) parts.push(`${plural(linked, "song")} from linked folders ${linked === 1 ? "is" : "are"} listed but not copied.`);
  if (failed.size) parts.push(`Couldn't write ${names(copied.filter((t) => failed.has(t.id)).map((t) => t.title))}.`);
  if (playlistFailures.length) parts.push(`Couldn't write the playlist copies ${names(playlistFailures)}; the backup file still has them.`);
  parts.push(
    backupName
      ? `To restore, add the folder in Add music. The backup is in ${backupName}.`
      : "Nothing else changed since the last backup here. To restore, add the folder in Add music.",
  );
  return parts.join(" ");
}

// Without folder access the audio can't be written out, and zipping it all wouldn't fit in a phone's memory.
export function backupZip(now = Date.now()): Blob {
  const backup = buildBackup(getTracks(), getPlaylists(), new Map(), now);
  return zip([
    { name: BACKUP_FILE, text: JSON.stringify(backup, null, 1) },
    ...playlistFiles(backup).map((f) => ({ name: `Playlists/${f.name}`, text: f.text })),
  ]);
}
