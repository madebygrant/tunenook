const SAMPLE = 64 * 1024;

// Size plus a hash of the first and last 64 KB: the same file under another name gives the same key, without
// reading a whole song. Edited tags change the start of the file, so a retagged copy counts as different.
export async function contentKey(file: Blob): Promise<string> {
  const head = file.slice(0, SAMPLE);
  const tail = file.size > SAMPLE ? file.slice(Math.max(SAMPLE, file.size - SAMPLE)) : new Blob();
  const bytes = await new Blob([head, tail]).arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `${file.size}:${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
