import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnvironment, makeTrack } from "./testing";

beforeEach(freshEnvironment);

const AUDIO = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 1, 0, 1, 9, 9, 9]);

async function setup() {
  const library = await import("./library");
  const exporter = await import("./exportSongs");
  await library.loadLibrary();
  const files: Record<string, Blob> = {};
  const add = async (id: string, patch: Parameters<typeof makeTrack>[1] = {}) => {
    files[id] = new Blob([AUDIO]);
    await library.addTrack({ track: makeTrack(id, patch), file: files[id] });
  };
  // fake-indexeddb hands stored blobs back as plain objects, so reads come from here instead.
  vi.spyOn(library, "storedFile").mockImplementation(async (id) => files[id]);
  vi.spyOn(library, "artBlob").mockImplementation(async () => new Blob([JPEG]));
  return { library, exporter, add };
}

const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe("prepareExport", () => {
  it("names each song after its file and puts its cover back in", async () => {
    const { exporter, add } = await setup();
    await add("a", { fileName: "01 Tension.mp3", artId: "art:x" });
    await add("b", { fileName: "02 Sahara.mp3" });
    const { files, linked } = await exporter.prepareExport(["a", "b"]);
    expect(files.map((f) => [f.name, f.type])).toEqual([
      ["01 Tension.mp3", "audio/mpeg"],
      ["02 Sahara.mp3", "audio/mpeg"],
    ]);
    const withCover = await bytes(files[0]);
    expect(new TextDecoder("latin1").decode(withCover.subarray(0, 14))).toContain("APIC");
    expect(withCover.subarray(-AUDIO.length)).toEqual(AUDIO);
    // No cover saved, so the file goes as it is.
    expect(await bytes(files[1])).toEqual(AUDIO);
    expect(linked).toEqual([]);
  });

  it("leaves out linked songs and unreadable ones, and numbers names that repeat", async () => {
    const { exporter, add, library } = await setup();
    await add("a", { fileName: "Intro.mp3" });
    await add("b", { fileName: "intro.mp3" });
    await library.addTrack({ track: makeTrack("gone") });
    await library.addTrack({ track: makeTrack("l", { source: { kind: "linked", folderId: "f", path: "x.mp3" } }) });
    const { files, linked, unreadable } = await exporter.prepareExport(["a", "b", "gone", "l"]);
    expect(files.map((f) => f.name)).toEqual(["Intro.mp3", "intro (2).mp3"]);
    expect(linked.map((t) => t.id)).toEqual(["l"]);
    expect(unreadable.map((t) => t.id)).toEqual(["gone"]);
  });
});

describe("prepareExport, other cases", () => {
  it("exports a song that appears twice in a playlist once", async () => {
    const { exporter, add } = await setup();
    await add("a", { fileName: "Intro.mp3" });
    const { files } = await exporter.prepareExport(["a", "a"]);
    expect(files.map((f) => f.name)).toEqual(["Intro.mp3"]);
  });

  it("notes songs whose file can't take their saved cover, but not ones that already have their own", async () => {
    const { exporter, library } = await setup();
    const files: Record<string, Blob> = {
      odd: new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]),
      own: new Blob([new Uint8Array([...new TextEncoder().encode("ID3"), 3, 0, 0, 0, 0, 0, 17, ...new TextEncoder().encode("APIC"), 0, 0, 0, 7, 0, 0, 0, 1, 2, 3, 4, 5, 6]), AUDIO]),
    };
    vi.mocked(library.storedFile).mockImplementation(async (id) => files[id]);
    await library.addTrack({ track: makeTrack("odd", { artId: "art:x" }) });
    await library.addTrack({ track: makeTrack("own", { artId: "art:x" }) });
    const { files: out, uncovered } = await exporter.prepareExport(["odd", "own"]);
    expect(out).toHaveLength(2);
    expect(uncovered.map((t) => t.id)).toEqual(["odd"]);
  });
});

describe("saveToFolder", () => {
  // A folder whose writes fail once it holds limit files, like a disk filling up.
  function folder(limit: number) {
    const stored = new Map<string, File>();
    const dir = {
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        if (!stored.has(name) && !options?.create) throw new DOMException("missing", "NotFoundError");
        return {
          getFile: async () => stored.get(name)!,
          createWritable: async () => ({
            write: async (data: Blob) => {
              if (stored.size >= limit) throw new DOMException("full", "QuotaExceededError");
              stored.set(name, new File([data], name));
            },
            close: async () => {},
            abort: async () => {},
          }),
        };
      },
      removeEntry: async (name: string) => void stored.delete(name),
    };
    return { dir, stored };
  }

  it("says how many it saved when it stops partway, and finishes on a second save without copies", async () => {
    const { exporter } = await setup();
    const files = ["a.mp3", "b.mp3", "c.mp3"].map((n) => new File([n], n));
    const { dir, stored } = folder(2);
    Object.assign(window, { showDirectoryPicker: async () => dir });
    const error = await exporter.saveToFolder(files).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(exporter.PartialSaveError);
    expect((error as InstanceType<typeof exporter.PartialSaveError>).written).toBe(2);
    expect([...stored.keys()]).toEqual(["a.mp3", "b.mp3"]);
    const roomier = folder(10);
    for (const [name, file] of stored) roomier.stored.set(name, file);
    Object.assign(window, { showDirectoryPicker: async () => roomier.dir });
    await expect(exporter.saveToFolder(files)).resolves.toBe(3);
    expect([...roomier.stored.keys()]).toEqual(["a.mp3", "b.mp3", "c.mp3"]);
  });
});

describe("sharing", () => {
  it("isn't offered where the browser can't share files", async () => {
    const { exporter } = await setup();
    expect(exporter.canShareFiles([new File(["x"], "a.mp3")])).toBe(false);
  });

  it("treats closing the share sheet as nothing done, and passes other failures on", async () => {
    const { exporter } = await setup();
    const share = vi.fn().mockRejectedValueOnce(new DOMException("closed", "AbortError")).mockRejectedValueOnce(new DOMException("too big", "DataError"));
    Object.assign(navigator, { share });
    await expect(exporter.shareFiles([])).resolves.toBe(false);
    await expect(exporter.shareFiles([])).rejects.toThrow("too big");
  });
});
