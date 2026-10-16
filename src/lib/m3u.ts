export function playlistName(fileName: string): string {
  return fileName.replace(/\.m3u8?$/i, "").trim() || "Imported playlist";
}

// Entries are paths relative to wherever the playlist was made, so only the file name is comparable.
export function m3uEntries(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const name = line.split(/[\\/]/).pop() ?? line;
      try {
        return decodeURIComponent(name);
      } catch {
        return name;
      }
    });
}

export function matchEntries(entries: string[], tracks: { id: string; fileName: string }[]): { ids: string[]; missing: number } {
  const byName = new Map<string, string>();
  for (const t of tracks) byName.set(t.fileName.toLowerCase(), t.id);
  const ids: string[] = [];
  let missing = 0;
  for (const entry of entries) {
    const id = byName.get(entry.toLowerCase());
    if (id) ids.push(id);
    else missing++;
  }
  return { ids, missing };
}

export function isPlaylistFile(file: { name: string }): boolean {
  return /\.m3u8?$/i.test(file.name);
}
