import { withNumber, writeNew } from "./backup";
import { download, safeFileName } from "./download";
import { artBlob, getTrack, storedFile } from "./library";
import { withCoverArt } from "./slim";
import type { Track } from "./types";

export interface PreparedExport {
  files: File[];
  // Songs from a linked folder, whose files are already on the device.
  linked: Track[];
  // Songs whose stored copy couldn't be read.
  unreadable: Track[];
}

// Each stored song as a file under its own name, with the cover TuneNook holds put back in. Names that repeat, as in
// a playlist, get a number.
export async function prepareExport(ids: string[], onProgress: (done: number) => void = () => {}): Promise<PreparedExport> {
  const files: File[] = [];
  const linked: Track[] = [];
  const unreadable: Track[] = [];
  const taken = new Set<string>();
  for (const [i, id] of ids.entries()) {
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
    const data = (art && (await withCoverArt(blob, art))) || blob;
    let name = safeFileName(track.fileName);
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = withNumber(safeFileName(track.fileName), n);
    taken.add(name.toLowerCase());
    files.push(new File([data], name, { type: track.type || blob.type }));
  }
  onProgress(ids.length);
  return { files, linked, unreadable };
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

// Never overwrites: a name already in the folder gets the next free number. Null when no folder was picked.
export async function saveToFolder(files: File[]): Promise<number | null> {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await window.showDirectoryPicker!({ id: "tunenook-export", mode: "readwrite" });
  } catch {
    return null;
  }
  for (const file of files) await writeNew(dir, file.name, file, async () => false);
  return files.length;
}

// Spaced out, since browsers drop downloads that start together.
export async function downloadFiles(files: File[]): Promise<void> {
  for (const [i, file] of files.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 400));
    download(file, file.name);
  }
}
