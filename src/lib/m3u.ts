export function playlistName(fileName: string): string {
  return fileName.replace(/\.m3u8?$/i, "").trim() || "Imported playlist";
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// Entries are paths relative to wherever the playlist was made, as split, lower-cased segments.
export function m3uEntries(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) =>
      line
        .replace(/^file:\/\//i, "")
        .split(/[\\/]/)
        .filter(Boolean)
        .map((segment) => decode(segment).toLowerCase()),
    );
}

export interface Candidate {
  id: string;
  path: string;
  // Imported in the same pick as the playlist.
  fresh: boolean;
}

function trailingMatch(entry: string[], path: string[]): number {
  let n = 0;
  while (n < entry.length && n < path.length && entry[entry.length - 1 - n] === path[path.length - 1 - n]) n++;
  return n;
}

// File names like "01 Intro.mp3" repeat across albums, so the candidate sharing the most trailing folders wins,
// then one from the same import.
export function matchEntries(entries: string[][], candidates: Candidate[]): { ids: string[]; missing: number } {
  const byName = new Map<string, { id: string; path: string[]; fresh: boolean }[]>();
  for (const c of candidates) {
    const path = c.path.toLowerCase().split("/").filter(Boolean);
    const name = path[path.length - 1];
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push({ id: c.id, path, fresh: c.fresh });
    byName.set(name, list);
  }
  const ids: string[] = [];
  let missing = 0;
  for (const entry of entries) {
    const options = byName.get(entry[entry.length - 1] ?? "");
    if (!options) {
      missing++;
      continue;
    }
    let best = options[0];
    let bestScore = -1;
    for (const option of options) {
      const score = trailingMatch(entry, option.path) * 2 + (option.fresh ? 1 : 0);
      if (score > bestScore) {
        best = option;
        bestScore = score;
      }
    }
    ids.push(best.id);
  }
  return { ids, missing };
}

export function isPlaylistFile(file: { name: string }): boolean {
  return /\.m3u8?$/i.test(file.name);
}
