import { sameBytes, withNumber, writeNew } from "./backup";
import { download, safeFileName } from "./download";
import { artBlob, getTrack, storedFile } from "./library";
import { hasCoverArt, withCoverArt } from "./slim";
import type { Track } from "./types";

export interface PreparedExport {
  files: File[];
  // Songs from a linked folder, whose files are already on the device.
  linked: Track[];
  // Songs whose stored copy couldn't be read.
  unreadable: Track[];
  // Songs with a saved cover that their file couldn't take, so they go without one.
  uncovered: Track[];
}

// Thrown when a folder save stops partway, with how many files made it.
export class PartialSaveError extends Error {
  readonly written: number;
  constructor(written: number) {
    super(`Saved ${written} files before stopping`);
    this.written = written;
  }
}

// Each stored song once, as a file under its own name, with the cover TuneNook holds put back in. Different songs
// with the same name get a number.
export async function prepareExport(ids: string[], onProgress: (done: number) => void = () => {}): Promise<PreparedExport> {
  const unique = [...new Set(ids)];
  const files: File[] = [];
  const linked: Track[] = [];
  const unreadable: Track[] = [];
  const uncovered: Track[] = [];
  const taken = new Set<string>();
  for (const [i, id] of unique.entries()) {
    onProgress(i);
    const track = getTrack(id);
    if (!track) continue;
    if (track.source.kind !== "copied") {
      linked.push(track);
      continue;
    }
    const blob = await storedFile(id).catch(() => undefined);
    if (!blob) {
      unreadable.push(track);
      continue;
    }
    const art = track.artId ? await artBlob(track.artId).catch(() => undefined) : undefined;
    const withArt = art && (await withCoverArt(blob, art));
    if (art && !withArt && !(await hasCoverArt(blob))) uncovered.push(track);
    const data = withArt || blob;
    let name = safeFileName(track.fileName);
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = withNumber(safeFileName(track.fileName), n);
    taken.add(name.toLowerCase());
    files.push(new File([data], name, { type: track.type || blob.type }));
  }
  onProgress(unique.length);
  return { files, linked, unreadable, uncovered };
}

export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files });
  } catch {
    return false;
  }
}

// False when the person closed the share sheet without choosing anything.
export async function shareFiles(files: File[]): Promise<boolean> {
  try {
    await navigator.share({ files });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return false;
    throw e;
  }
}

// Never overwrites: the same file already there is skipped, so saving again after a failure finishes the job, and any
// other file under the name gets the next free number. Null when no folder was picked.
export async function saveToFolder(files: File[]): Promise<number | null> {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await window.showDirectoryPicker!({ id: "tunenook-export", mode: "readwrite" });
  } catch {
    return null;
  }
  let written = 0;
  try {
    for (const file of files) {
      await writeNew(dir, file.name, file, (existing) => sameBytes(existing, file));
      written++;
    }
  } catch {
    throw new PartialSaveError(written);
  }
  return written;
}

// Spaced out, since browsers drop downloads that start together.
export async function downloadFiles(files: File[]): Promise<void> {
  for (const [i, file] of files.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 400));
    download(file, file.name);
  }
}
