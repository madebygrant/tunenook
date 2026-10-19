import { contentKey } from "./contentKey";
import { breather } from "./idle";
import { getTrack, getTracks, patchTrack, storedFile } from "./library";
import { getNowPlaying } from "./player";

// Rewriting a stored song for less isn't worth the write.
const MIN_SAVING = 16 * 1024;
const DONE_KEY = "tunenook.slimmed";
// Raised whenever slimAudio learns a new format, so songs stored before then get another pass.
const PASS_VERSION = "2";
const FLAC_PADDING = 1;
const FLAC_PICTURE = 6;

type Bytes = Uint8Array<ArrayBuffer>;

const bytesOf = async (blob: Blob, start: number, end: number): Promise<Bytes> =>
  new Uint8Array(await blob.slice(start, end).arrayBuffer());
const ascii = (b: Bytes, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const synchsafe = (b: Bytes, at: number) => (b[at] << 21) | (b[at + 1] << 14) | (b[at + 2] << 7) | b[at + 3];
const isSynchsafe = (b: Bytes, at: number) => b.subarray(at, at + 4).every((x) => x < 0x80);
const uint32 = (b: Bytes, at: number) => b[at] * 2 ** 24 + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];

function concat(parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Only v2.3 and v2.4 tags with no flags set; anything else, or frames that don't add up, gives null.
async function id3WithoutPictures(blob: Blob, at: number): Promise<{ bytes: Bytes; end: number } | null> {
  const head = await bytesOf(blob, at, at + 10);
  const version = head[3];
  if ((version !== 3 && version !== 4) || head[5] !== 0 || !isSynchsafe(head, 6)) return null;
  const end = at + 10 + synchsafe(head, 6);
  if (end > blob.size) return null;
  const body = await bytesOf(blob, at + 10, end);
  const kept: Bytes[] = [];
  let pos = 0;
  while (pos + 10 <= body.length && body[pos] !== 0) {
    if (!/^[A-Z0-9]{4}$/.test(ascii(body, pos, 4))) return null;
    // Old iTunes wrote v2.4 sizes unsynchsafed; a misread size fails the ID or padding checks, and the audio's start
    // comes from the tag header either way.
    if (version === 4 && !isSynchsafe(body, pos + 4)) return null;
    const next = pos + 10 + (version === 4 ? synchsafe(body, pos + 4) : uint32(body, pos + 4));
    if (next > body.length) return null;
    if (ascii(body, pos, 4) !== "APIC") kept.push(body.subarray(pos, next));
    pos = next;
  }
  // Anything after the frames must be padding, or the frames were misread.
  if (body.subarray(pos).some((x) => x !== 0)) return null;
  const frames = concat(kept);
  const size = frames.length;
  head.set([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f], 6);
  return { bytes: concat([head, frames]), end };
}

async function flacWithoutPictures(blob: Blob, at: number): Promise<{ bytes: Bytes; end: number } | null> {
  const kept: Bytes[] = [];
  let pos = at + 4;
  for (let last = false; !last; ) {
    const head = await bytesOf(blob, pos, pos + 4);
    if (head.length < 4) return null;
    last = (head[0] & 0x80) !== 0;
    const type = head[0] & 0x7f;
    // The stream info block always comes first, and 127 is reserved as invalid.
    if (type === 127 || (pos === at + 4 && type !== 0)) return null;
    const next = pos + 4 + ((head[1] << 16) | (head[2] << 8) | head[3]);
    if (next > blob.size) return null;
    if (type !== FLAC_PICTURE && type !== FLAC_PADDING) kept.push(await bytesOf(blob, pos, next));
    pos = next;
  }
  const sync = await bytesOf(blob, pos, pos + 2);
  if (sync[0] !== 0xff || (sync[1] & 0xfe) !== 0xf8) return null;
  kept.forEach((block, i) => (block[0] = (block[0] & 0x7f) | (i === kept.length - 1 ? 0x80 : 0)));
  return { bytes: concat([new TextEncoder().encode("fLaC"), ...kept]), end: pos };
}

interface Box {
  type: string;
  start: number;
  end: number;
  // Where the children or contents start.
  body: number;
}

// The boxes laid end to end from start to end, or null when they don't fill it exactly.
function boxesIn(b: Bytes, start: number, end: number): Box[] | null {
  const out: Box[] = [];
  for (let at = start; at < end; ) {
    if (at + 8 > end) return null;
    const size = uint32(b, at);
    // 64-bit and to-the-end sizes never occur inside moov; bailing keeps the size rewrites to 32-bit fields.
    if (size < 8 || at + size > end) return null;
    out.push({ type: ascii(b, at + 4, 4), start: at, end: at + size, body: at + 8 });
    at += size;
  }
  return out;
}

const only = (list: Box[] | null, type: string) => {
  const found = list?.filter((x) => x.type === type) ?? [];
  return found.length === 1 ? found[0] : null;
};

// Top-level boxes, read header by header so mdat itself is never loaded.
async function topLevel(blob: Blob): Promise<Box[] | null> {
  const out: Box[] = [];
  for (let at = 0; at < blob.size; ) {
    const head = await bytesOf(blob, at, at + 16);
    if (head.length < 8) return null;
    let size = uint32(head, 0);
    let header = 8;
    if (size === 1) {
      if (head.length < 16) return null;
      size = uint32(head, 8) * 2 ** 32 + uint32(head, 12);
      header = 16;
    } else if (size === 0) size = blob.size - at;
    if (size < header || at + size > blob.size) return null;
    out.push({ type: ascii(head, 4, 4), start: at, end: at + size, body: at + header });
    at += size;
  }
  return out;
}

// iTunes writes meta as a full box with four bytes of version and flags; QuickTime writes it without.
function metaChildren(b: Bytes, meta: Box): Box[] | null {
  for (const skip of [4, 0]) {
    const children = boxesIn(b, meta.body + skip, meta.end);
    if (children?.some((x) => x.type === "hdlr")) return children;
  }
  return null;
}

// Chunk offset tables of every track, or null if any track's can't be found.
function chunkTables(b: Bytes, moovChildren: Box[]): { box: Box; wide: boolean }[] | null {
  const tables: { box: Box; wide: boolean }[] = [];
  for (const trak of moovChildren.filter((x) => x.type === "trak")) {
    const mdia = only(boxesIn(b, trak.body, trak.end), "mdia");
    const minf = mdia && only(boxesIn(b, mdia.body, mdia.end), "minf");
    const stbl = minf && only(boxesIn(b, minf.body, minf.end), "stbl");
    const children = stbl && boxesIn(b, stbl.body, stbl.end);
    // Sample aux offsets (encryption) are absolute too, and aren't rewritten here.
    if (!children || children.some((x) => x.type === "saio")) return null;
    const stco = only(children, "stco");
    const co64 = only(children, "co64");
    if (!stco === !co64) return null;
    const box = (stco ?? co64)!;
    const width = stco ? 4 : 8;
    if (box.body + 8 + uint32(b, box.body + 4) * width !== box.end) return null;
    tables.push({ box, wide: !stco });
  }
  return tables.length ? tables : null;
}

function readOffsets(b: Bytes, { box, wide }: { box: Box; wide: boolean }): number[] {
  const count = uint32(b, box.body + 4);
  return Array.from({ length: count }, (_, i) =>
    wide
      ? uint32(b, box.body + 8 + i * 8) * 2 ** 32 + uint32(b, box.body + 12 + i * 8)
      : uint32(b, box.body + 8 + i * 4),
  );
}

function writeOffsets(b: Bytes, { box, wide }: { box: Box; wide: boolean }, offsets: number[]): void {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  offsets.forEach((n, i) => {
    if (wide) {
      view.setUint32(box.body + 8 + i * 8, Math.floor(n / 2 ** 32));
      view.setUint32(box.body + 12 + i * 8, n % 2 ** 32);
    } else view.setUint32(box.body + 8 + i * 4, n);
  });
}

// Removes moov/udta/meta/ilst/covr. When moov sits before the audio, every chunk offset after it moves back by the
// bytes removed. Fragmented and encrypted files, and anything not laid out as expected, give null.
async function mp4WithoutCovers(blob: Blob): Promise<Blob | null> {
  const top = await topLevel(blob);
  if (!top || top[0]?.type !== "ftyp" || top.some((x) => ["moof", "sidx", "mfra"].includes(x.type))) return null;
  const moovBox = only(top, "moov");
  if (!moovBox || moovBox.body !== moovBox.start + 8) return null;
  const moov = await bytesOf(blob, moovBox.start, moovBox.end);
  const moovChildren = boxesIn(moov, 8, moov.length);
  if (!moovChildren || moovChildren.some((x) => x.type === "mvex")) return null;
  const udta = only(moovChildren, "udta");
  const meta = udta && only(boxesIn(moov, udta.body, udta.end), "meta");
  const metaList = meta && metaChildren(moov, meta);
  const ilst = only(metaList, "ilst");
  const ilstChildren = ilst && boxesIn(moov, ilst.body, ilst.end);
  const covers = ilstChildren?.filter((x) => x.type === "covr") ?? [];
  if (!udta || !meta || !ilst || covers.length === 0) return null;
  const removed = covers.reduce((n, c) => n + c.end - c.start, 0);

  const tables = chunkTables(moov, moovChildren);
  if (!tables) return null;
  const before = tables.map((t) => readOffsets(moov, t));
  const after = before.map((list) => list.map((n) => (n >= moovBox.end ? n - removed : n)));
  // An offset into moov itself, or one past the end, means the table isn't what it seems.
  if (before.flat().some((n) => (n >= moovBox.start && n < moovBox.end) || n >= blob.size)) return null;
  tables.forEach((t, i) => writeOffsets(moov, t, after[i]));

  const view = new DataView(moov.buffer);
  for (const box of [{ start: 0 }, udta, meta, ilst]) view.setUint32(box.start, uint32(moov, box.start) - removed);
  const kept: Bytes[] = [];
  let at = 0;
  for (const c of covers) {
    kept.push(moov.subarray(at, c.start));
    at = c.end;
  }
  kept.push(moov.subarray(at));
  const slim = new Blob([blob.slice(0, moovBox.start), concat(kept), blob.slice(moovBox.end)], { type: blob.type });

  // Proof the offsets line up: each track's first and last chunk must start with the same bytes as before. The ends
  // suffice only because every offset after moov moves by the same amount. A chunk just before moov is compared up
  // to it.
  for (const [i, list] of before.entries()) {
    for (const j of list.length ? new Set([0, list.length - 1]) : []) {
      const length = Math.min(32, list[j] < moovBox.start ? moovBox.start - list[j] : 32);
      const was = await bytesOf(blob, list[j], list[j] + length);
      const now = await bytesOf(slim, after[i][j], after[i][j] + length);
      if (was.length === 0 || was.some((x, k) => x !== now[k]) || was.length !== now.length) return null;
    }
  }
  return slim;
}

// The song without its embedded cover pictures (and tag padding in MP3 and FLAC), or null when that saves little or
// the file isn't an MP3, FLAC or MP4 this can read for certain. The audio bytes are copied as they are.
export async function slimAudio(blob: Blob): Promise<Blob | null> {
  try {
    let magic = await bytesOf(blob, 0, 8);
    if (ascii(magic, 4, 4) === "ftyp") {
      const slim = await mp4WithoutCovers(blob);
      return slim && blob.size - slim.size >= MIN_SAVING ? slim : null;
    }
    const parts: Bytes[] = [];
    let at = 0;
    while (ascii(magic, 0, 3) === "ID3") {
      const tag = await id3WithoutPictures(blob, at);
      if (!tag) return null;
      parts.push(tag.bytes);
      at = tag.end;
      magic = await bytesOf(blob, at, at + 4);
    }
    if (ascii(magic, 0, 4) === "fLaC") {
      const meta = await flacWithoutPictures(blob, at);
      if (!meta) return null;
      parts.push(meta.bytes);
      at = meta.end;
    } else if (magic[0] !== 0xff || (magic[1] & 0xe0) !== 0xe0) {
      // Not an MPEG frame right after the tags, so the tag size can't be trusted.
      return null;
    }
    const head = parts.reduce((n, p) => n + p.length, 0);
    if (at - head < MIN_SAVING) return null;
    return new Blob([...parts, blob.slice(at)], { type: blob.type });
  } catch {
    return null;
  }
}

// Songs stored before slimming existed, one at a time while the app is idle. Each first gets its content key from
// the original bytes, so adding the original file again is still caught as a copy. Runs again only for a song skipped
// while it played; one that can't be read is left as it is.
export async function slimStoredSongs(): Promise<void> {
  try {
    if (localStorage.getItem(DONE_KEY) === PASS_VERSION) return;
  } catch {
    return;
  }
  let missed = false;
  // Without a saved cover, the embedded one is the only copy, so the file keeps it.
  for (const { id } of getTracks().filter((t) => t.source.kind === "copied" && t.artId)) {
    await breather();
    // Replacing the file under the song that's playing could interrupt it on some browsers.
    if (getNowPlaying().id === id) {
      missed = true;
      continue;
    }
    try {
      const file = await storedFile(id);
      const slim = file && (await slimAudio(file));
      if (!file || !slim) continue;
      const key = getTrack(id)?.contentKey ?? (await contentKey(file));
      await patchTrack(id, { size: slim.size, contentKey: key }, [{ store: "files", op: "put", key: id, value: slim }]);
    } catch {
      // Unreadable now, and likely on every start, so it doesn't hold the pass open.
    }
  }
  try {
    if (!missed) localStorage.setItem(DONE_KEY, PASS_VERSION);
  } catch {
    // Not saved, so the next start checks again and finds nothing left to slim.
  }
}
