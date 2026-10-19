import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { slimAudio, withCoverArt } from "./slim";
import { freshEnvironment, makeTrack } from "./testing";

const BIG = 40 * 1024;
const enc = (s: string) => new TextEncoder().encode(s);
const be = (n: number, len: number) => Array.from({ length: len }, (_, i) => (n >> (8 * (len - 1 - i))) & 0xff);
const safe = (n: number) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

// MPEG frame sync followed by filler that stands in for the audio.
const AUDIO = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...enc("audio frames")]);

function frame(id: string, body: Uint8Array, version: 3 | 4): Uint8Array<ArrayBuffer> {
  return new Uint8Array([...enc(id), ...(version === 4 ? safe(body.length) : be(body.length, 4)), 0, 0, ...body]);
}

function id3(frames: Uint8Array<ArrayBuffer>[], version: 3 | 4 = 3, padding = 0, flags = 0): Uint8Array<ArrayBuffer> {
  const body = new Uint8Array([...frames.flatMap((f) => [...f]), ...new Uint8Array(padding)]);
  return new Uint8Array([...enc("ID3"), version, 0, flags, ...safe(body.length), ...body]);
}

const title = (v: 3 | 4 = 3) => frame("TIT2", new Uint8Array([0, ...enc("Song")]), v);
const picture = (v: 3 | 4 = 3) => frame("APIC", new Uint8Array(BIG).fill(7), v);

function flacBlock(type: number, body: Uint8Array, last: boolean): Uint8Array<ArrayBuffer> {
  return new Uint8Array([(last ? 0x80 : 0) | type, ...be(body.length, 3), ...body]);
}

const FLAC_AUDIO = new Uint8Array([0xff, 0xf8, ...enc("flac frames")]);
const streamInfo = new Uint8Array(34).fill(1);
const comment = enc("comment block");

describe("slimAudio", () => {
  it("drops the cover from an MP3 and leaves the other tags and the audio as they were", async () => {
    for (const v of [3, 4] as const) {
      const slim = await slimAudio(new Blob([id3([title(v), picture(v)], v, 2048), AUDIO], { type: "audio/mpeg" }));
      expect(slim?.type).toBe("audio/mpeg");
      expect(await bytes(slim!)).toEqual(new Uint8Array([...id3([title(v)], v), ...AUDIO]));
    }
  });

  it("drops covers and padding from a FLAC and marks the new last block", async () => {
    const original = new Blob([
      enc("fLaC"),
      flacBlock(0, streamInfo, false),
      flacBlock(6, new Uint8Array(BIG), false),
      flacBlock(4, comment, false),
      flacBlock(1, new Uint8Array(1024), true),
      FLAC_AUDIO,
    ]);
    const slim = await slimAudio(original);
    expect(await bytes(slim!)).toEqual(
      new Uint8Array([...enc("fLaC"), ...flacBlock(0, streamInfo, false), ...flacBlock(4, comment, true), ...FLAC_AUDIO]),
    );
  });

  it("handles a FLAC with an ID3 tag in front", async () => {
    const original = new Blob([id3([title(), picture()]), enc("fLaC"), flacBlock(0, streamInfo, true), FLAC_AUDIO]);
    expect(await bytes((await slimAudio(original))!)).toEqual(
      new Uint8Array([...id3([title()]), ...enc("fLaC"), ...flacBlock(0, streamInfo, true), ...FLAC_AUDIO]),
    );
  });

  it("leaves a file alone when there's little to save", async () => {
    expect(await slimAudio(new Blob([id3([title()], 3, 100), AUDIO]))).toBeNull();
    expect(await slimAudio(new Blob([AUDIO]))).toBeNull();
  });

  it("leaves anything it can't read for certain alone", async () => {
    const cases = [
      // Unsynchronised tag.
      new Blob([id3([title(), picture()], 3, 0, 0x80), AUDIO]),
      // v2.2.
      new Blob([id3([title(), picture()], 3).map((b, i) => (i === 3 ? 2 : b)), AUDIO]),
      // No MPEG frame where the tag says it ends.
      new Blob([id3([title(), picture()]), enc("junk"), AUDIO]),
      // A frame running past the end of the tag.
      new Blob([id3([title(), picture()]).slice(0, -10), AUDIO]),
      // A FLAC whose first block isn't the stream info.
      new Blob([enc("fLaC"), flacBlock(6, new Uint8Array(BIG), false), flacBlock(0, streamInfo, true), FLAC_AUDIO]),
      // MP4 and others.
      new Blob([new Uint8Array(4), enc("ftypM4A "), new Uint8Array(BIG)]),
    ];
    for (const blob of cases) expect(await slimAudio(blob)).toBeNull();
  });
});

type B = Uint8Array<ArrayBuffer>;
const join = (parts: B[]): B => new Uint8Array(parts.flatMap((p) => [...p]));
const box = (type: string, ...parts: B[]): B => {
  const body = join(parts);
  // Box types are four bytes of Latin-1, as in ©nam.
  return new Uint8Array([...be(body.length + 8, 4), ...Array.from(type, (c) => c.charCodeAt(0)), ...body]);
};
const full = (type: string, ...parts: B[]) => box(type, new Uint8Array(4), ...parts);
const SAMPLES = enc("first chunk.....second chunk....");
const chunks = (offsets: number[], wide = false) =>
  wide
    ? full("co64", new Uint8Array([...be(offsets.length, 4), ...offsets.flatMap((n) => [...be(0, 4), ...be(n, 4)])]))
    : full("stco", new Uint8Array([...be(offsets.length, 4), ...offsets.flatMap((n) => be(n, 4))]));

interface Mp4Options {
  moovFirst?: boolean;
  wide?: boolean;
  quickTimeMeta?: boolean;
  cover?: boolean;
  extra?: B;
  udta?: boolean;
}

// ftyp, then moov and mdat in either order, with each track's chunk offsets pointing into mdat.
function mp4({ moovFirst = true, wide = false, quickTimeMeta = false, cover = true, extra = new Uint8Array(), udta = true }: Mp4Options = {}) {
  const ftyp = box("ftyp", enc("M4A "), new Uint8Array(4));
  const mdat = box("mdat", SAMPLES);
  const tags = box("ilst", box("\xa9nam", full("data", enc("Song"))), ...(cover ? [box("covr", full("data", new Uint8Array(BIG).fill(9)))] : []));
  const hdlr = full("hdlr", enc("....mdirappl"));
  const meta = quickTimeMeta ? box("meta", hdlr, tags) : full("meta", hdlr, tags);
  const build = (offsets: number[]) =>
    box("moov", box("mvhd", new Uint8Array(4)), box("trak", box("mdia", box("minf", box("stbl", chunks(offsets, wide), extra)))), ...(udta ? [box("udta", meta)] : []));
  const size = build([0, 0]).length;
  const mdatAt = ftyp.length + (moovFirst ? size : 0);
  const moov = build([mdatAt + 8, mdatAt + 24]);
  return new Blob(moovFirst ? [ftyp, moov, mdat] : [ftyp, mdat, moov]);
}

// Reads each chunk the way a player would: through the offsets in the (possibly rewritten) file.
async function chunksOf(blob: Blob): Promise<string[]> {
  const b = await bytes(blob);
  const text = new TextDecoder("latin1").decode(b);
  const table = Math.max(text.indexOf("stco"), text.indexOf("co64"));
  const wide = text.slice(table, table + 4) === "co64";
  const view = new DataView(b.buffer);
  const count = view.getUint32(table + 8);
  return Array.from({ length: count }, (_, i) => {
    const at = wide ? view.getUint32(table + 16 + i * 8) : view.getUint32(table + 12 + i * 4);
    return text.slice(at, at + 12);
  });
}

describe("slimAudio on MP4", () => {
  it("drops the cover, keeps the other tags and moves every chunk offset back when moov comes first", async () => {
    for (const wide of [false, true]) {
      const original = mp4({ wide });
      const slim = (await slimAudio(original))!;
      expect(original.size - slim.size).toBe(BIG + 20);
      const text = new TextDecoder("latin1").decode(await bytes(slim));
      expect(text).not.toContain("covr");
      expect(text).toContain("\xa9nam");
      expect(await chunksOf(slim)).toEqual(["first chunk.", "second chunk"]);
    }
  });

  it("leaves the offsets alone when the audio comes before moov", async () => {
    const slim = (await slimAudio(mp4({ moovFirst: false })))!;
    expect(await chunksOf(slim)).toEqual(["first chunk.", "second chunk"]);
  });

  it("reads QuickTime-style meta boxes, which have no version and flags", async () => {
    const slim = (await slimAudio(mp4({ quickTimeMeta: true })))!;
    expect(await chunksOf(slim)).toEqual(["first chunk.", "second chunk"]);
  });

  it("leaves files it can't rewrite for certain alone", async () => {
    const cases = [
      mp4({ cover: false }),
      // Encrypted: sample aux offsets are absolute too.
      mp4({ extra: full("saio", new Uint8Array(8)) }),
      // Fragmented.
      new Blob([mp4(), box("moof", new Uint8Array(8))]),
      // Trailing bytes that aren't a box.
      new Blob([mp4(), enc("junk")]),
    ];
    for (const blob of cases) expect(await slimAudio(blob)).toBeNull();
  });
});

// A JPEG's start: the image marker, then a frame header saying 100 high by 200 wide.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 100, 0, 200, ...new Array(64).fill(5)]);
const art = new Blob([JPEG], { type: "image/jpeg" });
const has = (b: Uint8Array, part: Uint8Array) => {
  outer: for (let i = 0; i + part.length <= b.length; i++) {
    for (let j = 0; j < part.length; j++) if (b[i + j] !== part[j]) continue outer;
    return true;
  }
  return false;
};

describe("withCoverArt", () => {
  it("adds the cover to an MP3's tag, keeping its other frames and the audio", async () => {
    for (const v of [3, 4] as const) {
      const out = await bytes((await withCoverArt(new Blob([id3([title(v)], v, 512), AUDIO]), art))!);
      const apic = frame("APIC", new Uint8Array([0, ...enc("image/jpeg"), 0, 3, 0, ...JPEG]), v);
      expect(out).toEqual(new Uint8Array([...id3([title(v), apic], v), ...AUDIO]));
    }
  });

  it("gives an MP3 with no tag a new one", async () => {
    const out = await bytes((await withCoverArt(new Blob([AUDIO]), art))!);
    const apic = frame("APIC", new Uint8Array([0, ...enc("image/jpeg"), 0, 3, 0, ...JPEG]), 3);
    expect(out).toEqual(new Uint8Array([...id3([apic]), ...AUDIO]));
  });

  it("adds a picture block to a FLAC, with the image's size, as the new last block", async () => {
    const out = await bytes((await withCoverArt(new Blob([enc("fLaC"), flacBlock(0, streamInfo, false), flacBlock(4, comment, true), FLAC_AUDIO]), art))!);
    const picture = new Uint8Array([...be(3, 4), ...be(10, 4), ...enc("image/jpeg"), ...be(0, 4), ...be(200, 4), ...be(100, 4), ...be(24, 4), ...be(0, 4), ...be(JPEG.length, 4), ...JPEG]);
    expect(out).toEqual(new Uint8Array([...enc("fLaC"), ...flacBlock(0, streamInfo, false), ...flacBlock(4, comment, false), ...flacBlock(6, picture, true), ...FLAC_AUDIO]));
  });

  it("adds the cover to an MP4 and moves the chunk offsets to match, making the tag boxes when there are none", async () => {
    for (const options of [{}, { wide: true }, { moovFirst: false }, { udta: false }, { quickTimeMeta: true }]) {
      const out = (await withCoverArt(mp4({ ...options, cover: false }), art))!;
      expect(await chunksOf(out)).toEqual(["first chunk.", "second chunk"]);
      const b = await bytes(out);
      expect(has(b, new Uint8Array([...enc("covr"), ...be(JPEG.length + 16, 4), ...enc("data"), ...be(13, 4), ...be(0, 4), ...JPEG]))).toBe(true);
    }
  });

  it("won't add a second cover to a song it has already covered", async () => {
    const original = mp4({ cover: false });
    const withArt = (await withCoverArt(original, art))!;
    expect(await bytes((await withCoverArt(withArt, art)) ?? new Blob())).toEqual(new Uint8Array());
    expect(await chunksOf(withArt)).toEqual(["first chunk.", "second chunk"]);
  });

  it("leaves songs that already have a cover, and art it can't embed, alone", async () => {
    expect(await withCoverArt(new Blob([id3([title(), picture()]), AUDIO]), art)).toBeNull();
    expect(await withCoverArt(new Blob([enc("fLaC"), flacBlock(0, streamInfo, false), flacBlock(6, new Uint8Array(8), true), FLAC_AUDIO]), art)).toBeNull();
    expect(await withCoverArt(mp4(), art)).toBeNull();
    expect(await withCoverArt(new Blob([AUDIO]), new Blob([enc("GIF89a")]))).toBeNull();
  });
});

describe("slimStoredSongs", () => {
  beforeEach(freshEnvironment);

  async function setup() {
    const library = await import("./library");
    const player = await import("./player");
    const { contentKey } = await import("./contentKey");
    const { slimStoredSongs } = await import("./slim");
    await library.loadLibrary();
    const covered = new Blob([id3([title(), picture()]), AUDIO]);
    const files: Record<string, Blob> = { a: covered, b: covered, plain: new Blob([AUDIO]) };
    for (const id of Object.keys(files)) await library.addTrack({ track: makeTrack(id, { size: files[id].size, artId: "art:x" }), file: files[id] });
    await library.addTrack({ track: makeTrack("bare", { size: covered.size }), file: covered });
    files.bare = covered;
    // fake-indexeddb hands stored blobs back as plain objects, so reads come from here instead.
    vi.spyOn(library, "storedFile").mockImplementation(async (id) => files[id]);
    const patch = library.patchTrack;
    const writes = vi.spyOn(library, "patchTrack").mockImplementation((id, changes, extra = []) => {
      for (const w of extra) if (w.store === "files" && w.op === "put") files[id] = w.value as Blob;
      return patch(id, changes, extra);
    });
    return { library, player, contentKey, slimStoredSongs, covered, writes };
  }

  it("rewrites stored songs that have a cover, keeping the original's content key, and doesn't run again", async () => {
    const { library, contentKey, slimStoredSongs, covered, writes } = await setup();
    await slimStoredSongs();
    const slimSize = id3([title()]).length + AUDIO.length;
    expect(library.getTrack("a")).toMatchObject({ size: slimSize, contentKey: await contentKey(covered) });
    expect(library.getTrack("plain")?.size).toBe(AUDIO.length);
    // bare has no saved cover, so its file keeps the only copy.
    expect(writes.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    await slimStoredSongs();
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it("runs again for songs stored before it learned a new format", async () => {
    const { slimStoredSongs, writes } = await setup();
    localStorage.setItem("tunenook.slimmed", "1");
    await slimStoredSongs();
    expect(writes.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
  });

  it("skips the song playing and tries again at the next start", async () => {
    const { player, slimStoredSongs, writes } = await setup();
    vi.spyOn(player, "getNowPlaying").mockReturnValue({ id: "a", playing: false, blocked: false, failure: null });
    await slimStoredSongs();
    expect(writes.mock.calls.map(([id]) => id)).toEqual(["b"]);
    vi.mocked(player.getNowPlaying).mockReturnValue({ id: null, playing: false, blocked: false, failure: null });
    await slimStoredSongs();
    expect(writes.mock.calls.map(([id]) => id)).toEqual(["b", "a"]);
  });
});

describe("songs stored from now on", () => {
  beforeEach(freshEnvironment);

  const text = (id: string, value: string) => frame(id, new Uint8Array([0, ...enc(value)]), 3);
  const tagged = (cover: boolean) =>
    new File([id3([text("TIT2", "Song"), text("TPE1", "Band"), text("TALB", "Album"), ...(cover ? [picture()] : [])]), AUDIO], "song.mp3", {
      type: "audio/mpeg",
    });
  const slimSize = id3([text("TIT2", "Song"), text("TPE1", "Band"), text("TALB", "Album")]).length + AUDIO.length;

  async function setup(albumHasCover: boolean) {
    const library = await import("./library");
    const importer = await import("./importer");
    const folders = await import("./folders");
    const { contentKey } = await import("./contentKey");
    await library.loadLibrary();
    const artId = albumHasCover ? "art:saved" : null;
    await library.addTrack({ track: makeTrack("first", { album: "Album", albumArtist: "Band", artist: "Band", artId }) });
    // Publishes the album list now rather than after its short delay.
    await library.updateTracks(new Map([["first", {}]]), { now: true });
    const puts = vi.spyOn(library, "addTrack");
    return { library, importer, folders, contentKey, puts };
  }

  it("are imported without the cover when the album has one saved", async () => {
    const { importer, puts } = await setup(true);
    await importer.importFiles([tagged(true)], () => {});
    const { track, file } = puts.mock.calls[0][0];
    expect(track.size).toBe(slimSize);
    expect(file?.size).toBe(slimSize);
  });

  it("keep a cover the app couldn't save, as the file holds the only copy", async () => {
    const { importer, puts } = await setup(false);
    const original = tagged(true);
    // jsdom can't decode images, so the cover isn't saved.
    await importer.importFiles([original], () => {});
    const { track, file } = puts.mock.calls[0][0];
    expect(track.artId).toBeNull();
    expect(file?.size).toBe(original.size);
  });

  it("are copied in from a linked folder without the cover, keyed by the original", async () => {
    const { library, folders, contentKey } = await setup(true);
    const original = tagged(true);
    // Methods on a class, so the folder handle can be cloned into the database.
    class Dir {
      queryPermission() {
        return Promise.resolve("granted");
      }
      getDirectoryHandle() {
        return Promise.resolve(this);
      }
      getFileHandle() {
        return Promise.resolve({ getFile: () => Promise.resolve(original) });
      }
    }
    await library.saveFolder({ id: "f1", name: "Music", handle: new Dir() as unknown as FileSystemDirectoryHandle, addedAt: 1 });
    const linked = makeTrack("l", { artId: "art:saved", source: { kind: "linked", folderId: "f1", path: "song.mp3" } });
    await library.addTrack({ track: linked });
    await folders.copyIntoLibrary([linked], () => {});
    expect(library.getTrack("l")).toMatchObject({ source: { kind: "copied" }, size: slimSize, contentKey: await contentKey(original) });
  });
});
