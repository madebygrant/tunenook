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

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const text = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

interface Id3 {
  head: Bytes;
  version: number;
  frames: { id: string; bytes: Bytes }[];
  end: number;
}

// Only v2.3 and v2.4 tags with no flags set; anything else, or frames that don't add up, gives null.
async function readId3(blob: Blob, at: number): Promise<Id3 | null> {
  const head = await bytesOf(blob, at, at + 10);
  const version = head[3];
  if ((version !== 3 && version !== 4) || head[5] !== 0 || !isSynchsafe(head, 6)) return null;
  const end = at + 10 + synchsafe(head, 6);
  if (end > blob.size) return null;
  const body = await bytesOf(blob, at + 10, end);
  const frames: Id3["frames"] = [];
  let pos = 0;
  while (pos + 10 <= body.length && body[pos] !== 0) {
    const id = ascii(body, pos, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) return null;
    // Old iTunes wrote v2.4 sizes unsynchsafed; a misread size fails the ID or padding checks, and the audio's start
    // comes from the tag header either way.
    if (version === 4 && !isSynchsafe(body, pos + 4)) return null;
    const next = pos + 10 + (version === 4 ? synchsafe(body, pos + 4) : uint32(body, pos + 4));
    if (next > body.length) return null;
    frames.push({ id, bytes: body.subarray(pos, next) });
    pos = next;
  }
  // Anything after the frames must be padding, or the frames were misread.
  if (body.subarray(pos).some((x) => x !== 0)) return null;
  return { head, version, frames, end };
}

// The tag with just these frames and no padding.
function writeId3(tag: Id3, frames: Bytes[]): Bytes {
  const body = concat(frames);
  const head = tag.head.slice();
  const size = body.length;
  head.set([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f], 6);
  return concat([head, body]);
}

interface Flac {
  blocks: { type: number; bytes: Bytes }[];
  end: number;
}

async function readFlac(blob: Blob, at: number): Promise<Flac | null> {
  const blocks: Flac["blocks"] = [];
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
    blocks.push({ type, bytes: await bytesOf(blob, pos, next) });
    pos = next;
  }
  const sync = await bytesOf(blob, pos, pos + 2);
  if (sync[0] !== 0xff || (sync[1] & 0xfe) !== 0xf8) return null;
  return { blocks, end: pos };
}

// The blocks in order after the stream marker, with only the final one flagged as last.
function writeFlac(blocks: Bytes[]): Bytes {
  const out = blocks.map((b) => b.slice());
  out.forEach((block, i) => (block[0] = (block[0] & 0x7f) | (i === out.length - 1 ? 0x80 : 0)));
  return concat([new Uint8Array(text("fLaC")), ...out]);
}

interface Tags {
  id3: Id3[];
  flac: Flac | null;
  // Where the audio starts.
  audio: number;
}

// The ID3 tags at the start, then either FLAC metadata or the first MPEG frame. Null for anything else.
async function readTags(blob: Blob): Promise<Tags | null> {
  const id3: Id3[] = [];
  let at = 0;
  let magic = await bytesOf(blob, 0, 4);
  while (ascii(magic, 0, 3) === "ID3") {
    const tag = await readId3(blob, at);
    if (!tag) return null;
    id3.push(tag);
    at = tag.end;
    magic = await bytesOf(blob, at, at + 4);
  }
  if (ascii(magic, 0, 4) === "fLaC") {
    const flac = await readFlac(blob, at);
    return flac && { id3, flac, audio: flac.end };
  }
  // Not an MPEG frame right after the tags, so the tag size can't be trusted.
  if (magic[0] !== 0xff || (magic[1] & 0xe0) !== 0xe0) return null;
  return { id3, flac: null, audio: at };
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

interface Table {
  box: Box;
  wide: boolean;
}

// Chunk offset tables of every track, or null if any track's can't be found.
function chunkTables(b: Bytes, moovChildren: Box[]): Table[] | null {
  const tables: Table[] = [];
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

function readOffsets(b: Bytes, { box, wide }: Table): number[] {
  const count = uint32(b, box.body + 4);
  return Array.from({ length: count }, (_, i) =>
    wide
      ? uint32(b, box.body + 8 + i * 8) * 2 ** 32 + uint32(b, box.body + 12 + i * 8)
      : uint32(b, box.body + 8 + i * 4),
  );
}

function writeOffsets(b: Bytes, { box, wide }: Table, offsets: number[]): void {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  offsets.forEach((n, i) => {
    if (wide) {
      view.setUint32(box.body + 8 + i * 8, Math.floor(n / 2 ** 32));
      view.setUint32(box.body + 12 + i * 8, n % 2 ** 32);
    } else view.setUint32(box.body + 8 + i * 4, n);
  });
}

interface Mp4 {
  moovBox: Box;
  // moov's own bytes, which are edited in place.
  moov: Bytes;
  children: Box[];
  tables: Table[];
  offsets: number[][];
}

// Fragmented and encrypted files, and anything not laid out as expected, give null.
async function readMp4(blob: Blob): Promise<Mp4 | null> {
  const top = await topLevel(blob);
  if (!top || top[0]?.type !== "ftyp" || top.some((x) => ["moof", "sidx", "mfra"].includes(x.type))) return null;
  const moovBox = only(top, "moov");
  if (!moovBox || moovBox.body !== moovBox.start + 8) return null;
  const moov = await bytesOf(blob, moovBox.start, moovBox.end);
  const children = boxesIn(moov, 8, moov.length);
  if (!children || children.some((x) => x.type === "mvex")) return null;
  const tables = chunkTables(moov, children);
  if (!tables) return null;
  const offsets = tables.map((t) => readOffsets(moov, t));
  // An offset into moov itself, or one past the end, means the table isn't what it seems.
  if (offsets.flat().some((n) => (n >= moovBox.start && n < moovBox.end) || n >= blob.size)) return null;
  return { moovBox, moov, children, tables, offsets };
}

// Swaps moov for edit's result. When moov sits before the audio, every chunk offset after it moves by the change in
// moov's size. Then proves the offsets line up: each track's first and last chunk must start with the same bytes as
// before, which suffices only because every offset moves by the same amount.
async function replaceMoov(blob: Blob, mp4: Mp4, delta: number, edit: (moov: Bytes) => Bytes): Promise<Blob | null> {
  const { moovBox, moov, tables, offsets } = mp4;
  const after = offsets.map((list) => list.map((n) => (n >= moovBox.end ? n + delta : n)));
  tables.forEach((t, i) => writeOffsets(moov, t, after[i]));
  const edited = edit(moov);
  if (edited.length !== moov.length + delta) return null;
  const out = new Blob([blob.slice(0, moovBox.start), edited, blob.slice(moovBox.end)], { type: blob.type });
  for (const [i, list] of offsets.entries()) {
    for (const j of list.length ? new Set([0, list.length - 1]) : []) {
      // A chunk just before moov is compared only up to it, as moov's own bytes have changed.
      const length = Math.min(32, list[j] < moovBox.start ? moovBox.start - list[j] : 32);
      const was = await bytesOf(blob, list[j], list[j] + length);
      const now = await bytesOf(out, after[i][j], after[i][j] + length);
      if (was.length === 0 || was.some((x, k) => x !== now[k]) || was.length !== now.length) return null;
    }
  }
  return out;
}

const growBoxes = (moov: Bytes, boxes: { start: number }[], by: number) => {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  for (const box of boxes) view.setUint32(box.start, uint32(moov, box.start) + by);
};

// moov/udta/meta/ilst/covr and the boxes that hold them, or null when there's no cover there.
function mp4Covers({ moov, children }: Mp4) {
  const udta = only(children, "udta");
  const meta = udta && only(boxesIn(moov, udta.body, udta.end), "meta");
  const ilst = meta && only(metaChildren(moov, meta), "ilst");
  const covers = (ilst && boxesIn(moov, ilst.body, ilst.end)?.filter((x) => x.type === "covr")) || [];
  return udta && meta && ilst && covers.length ? { udta, meta, ilst, covers } : null;
}

// Removes moov/udta/meta/ilst/covr.
async function mp4WithoutCovers(blob: Blob): Promise<Blob | null> {
  const mp4 = await readMp4(blob);
  const found = mp4 && mp4Covers(mp4);
  if (!mp4 || !found) return null;
  const { udta, meta, ilst, covers } = found;
  const removed = covers.reduce((n, c) => n + c.end - c.start, 0);
  return replaceMoov(blob, mp4, -removed, (bytes) => {
    growBoxes(bytes, [{ start: 0 }, udta, meta, ilst], -removed);
    const kept: Bytes[] = [];
    let at = 0;
    for (const c of covers) {
      kept.push(bytes.subarray(at, c.start));
      at = c.end;
    }
    kept.push(bytes.subarray(at));
    return concat(kept);
  });
}

interface Picture {
  mime: "image/jpeg" | "image/png";
  data: Bytes;
  width: number;
  height: number;
}

// The size from the first frame header; 0 by 0 when it can't be found, which readers accept.
function jpegSize(b: Bytes): [number, number] {
  for (let i = 2; i + 9 < b.length && b[i] === 0xff; ) {
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return [0, 0];
}

async function pictureOf(art: Blob): Promise<Picture | null> {
  const data = new Uint8Array(await art.arrayBuffer());
  if (data[0] === 0xff && data[1] === 0xd8) {
    const [width, height] = jpegSize(data);
    return { mime: "image/jpeg", data, width, height };
  }
  if (ascii(data, 1, 3) === "PNG") return { mime: "image/png", data, width: uint32(data, 16), height: uint32(data, 20) };
  return null;
}

function box(type: string, ...parts: (Bytes | number[])[]): Bytes {
  const body = concat(parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p))));
  return concat([new Uint8Array([...u32(body.length + 8), ...text(type)]), body]);
}

// Adds moov/udta/meta/ilst/covr, making whichever of udta, meta and ilst is missing.
async function mp4WithCover(blob: Blob, picture: Picture): Promise<Blob | null> {
  const mp4 = await readMp4(blob);
  if (!mp4) return null;
  const { moov, children } = mp4;
  let added = box("covr", box("data", u32(picture.mime === "image/png" ? 14 : 13), u32(0), picture.data));
  const parents: Box[] = [];
  const wrap = () => {
    added = box("ilst", added);
    const hdlr = box("hdlr", u32(0), u32(0), text("mdir"), text("appl"), new Array(8).fill(0), [0]);
    added = box("meta", u32(0), hdlr, added);
  };
  const udtas = children.filter((x) => x.type === "udta");
  const udta = only(children, "udta");
  if (udtas.length > 1) return null;
  if (!udta) {
    wrap();
    added = box("udta", added);
  } else {
    const inUdta = boxesIn(moov, udta.body, udta.end);
    if (!inUdta || inUdta.filter((x) => x.type === "meta").length > 1) return null;
    const meta = only(inUdta, "meta");
    parents.push(udta);
    if (!meta) wrap();
    else {
      const inMeta = metaChildren(moov, meta);
      const ilst = only(inMeta, "ilst");
      const inIlst = ilst && boxesIn(moov, ilst.body, ilst.end);
      if (!ilst || !inIlst || inIlst.some((x) => x.type === "covr")) return null;
      parents.push(meta, ilst);
    }
  }
  const at = parents.at(-1)?.end ?? moov.length;
  return replaceMoov(blob, mp4, added.length, (bytes) => {
    growBoxes(bytes, [{ start: 0 }, ...parents], added.length);
    return concat([bytes.subarray(0, at), added, bytes.subarray(at)]);
  });
}

function apicFrame(picture: Picture, version: number): Bytes {
  const body = [0, ...text(picture.mime), 0, 3, 0];
  const size = body.length + picture.data.length;
  const sizeBytes = version === 4 ? [(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f] : u32(size);
  return concat([new Uint8Array([...text("APIC"), ...sizeBytes, 0, 0, ...body]), picture.data]);
}

function pictureBlock(picture: Picture): Bytes {
  const body = concat([
    new Uint8Array([...u32(3), ...u32(picture.mime.length), ...text(picture.mime), ...u32(0)]),
    new Uint8Array([...u32(picture.width), ...u32(picture.height), ...u32(24), ...u32(0), ...u32(picture.data.length)]),
    picture.data,
  ]);
  const n = body.length;
  return concat([new Uint8Array([FLAC_PICTURE, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]), body]);
}

// The song without its embedded cover pictures (and tag padding in MP3 and FLAC), or null when that saves little or
// the file isn't an MP3, FLAC or MP4 this can read for certain. The audio bytes are copied as they are.
export async function slimAudio(blob: Blob): Promise<Blob | null> {
  try {
    if (ascii(await bytesOf(blob, 4, 8), 0, 4) === "ftyp") {
      const slim = await mp4WithoutCovers(blob);
      return slim && blob.size - slim.size >= MIN_SAVING ? slim : null;
    }
    const tags = await readTags(blob);
    if (!tags) return null;
    const parts = tags.id3.map((t) => writeId3(t, t.frames.filter((f) => f.id !== "APIC").map((f) => f.bytes)));
    if (tags.flac) {
      parts.push(writeFlac(tags.flac.blocks.filter((b) => b.type !== FLAC_PICTURE && b.type !== FLAC_PADDING).map((b) => b.bytes)));
    }
    const head = parts.reduce((n, p) => n + p.length, 0);
    if (tags.audio - head < MIN_SAVING) return null;
    return new Blob([...parts, blob.slice(tags.audio)], { type: blob.type });
  } catch {
    return null;
  }
}

// Whether the song already carries a cover in a place this reads.
export async function hasCoverArt(blob: Blob): Promise<boolean> {
  try {
    if (ascii(await bytesOf(blob, 4, 8), 0, 4) === "ftyp") {
      const mp4 = await readMp4(blob);
      return mp4 !== null && mp4Covers(mp4) !== null;
    }
    const tags = await readTags(blob);
    if (!tags) return false;
    return tags.id3.some((t) => t.frames.some((f) => f.id === "APIC")) || (tags.flac?.blocks.some((b) => b.type === FLAC_PICTURE) ?? false);
  } catch {
    return false;
  }
}

// The song with art embedded as its cover, for a copy that leaves the app. Null when it already has a cover, or isn't
// an MP3, FLAC or MP4 this can write for certain; the audio bytes are copied as they are.
export async function withCoverArt(blob: Blob, art: Blob): Promise<Blob | null> {
  try {
    const picture = await pictureOf(art);
    if (!picture) return null;
    if (ascii(await bytesOf(blob, 4, 8), 0, 4) === "ftyp") return await mp4WithCover(blob, picture);
    const tags = await readTags(blob);
    if (!tags || tags.id3.some((t) => t.frames.some((f) => f.id === "APIC"))) return null;
    const id3 = tags.id3.map((t) => writeId3(t, t.frames.map((f) => f.bytes)));
    let parts: Bytes[];
    if (tags.flac) {
      const blocks = tags.flac.blocks;
      if (blocks.some((b) => b.type === FLAC_PICTURE)) return null;
      parts = [...id3, writeFlac([...blocks.map((b) => b.bytes), pictureBlock(picture)])];
    } else {
      const [first] = tags.id3;
      const tag: Id3 = first ?? { head: new Uint8Array([...text("ID3"), 3, 0, 0, 0, 0, 0, 0]), version: 3, frames: [], end: 0 };
      parts = [writeId3(tag, [...tag.frames.map((f) => f.bytes), apicFrame(picture, tag.version)]), ...id3.slice(1)];
    }
    return new Blob([...parts, blob.slice(tags.audio)], { type: blob.type });
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
