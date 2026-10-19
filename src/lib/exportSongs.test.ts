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
