import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnvironment } from "./testing";

beforeEach(freshEnvironment);

function audioFile(name: string, folder?: string): File {
  const file = new File([`not really audio: ${name}`], name, { type: "audio/mpeg" });
  if (folder) Object.defineProperty(file, "webkitRelativePath", { value: `${folder}/${name}` });
  return file;
}

async function load() {
  const library = await import("./library");
  const importer = await import("./importer");
  await library.loadLibrary();
  return { library, importer };
}

describe("importFiles", () => {
  it("names untagged songs from the file name and counts them", async () => {
    const { library, importer } = await load();
    const summary = await importer.importFiles([audioFile("03 - Nina Simone - Feeling Good.mp3")], () => {});
    expect(summary.added).toBe(1);
    expect(summary.untagged).toBe(1);
    const [track] = library.getTracks();
    expect(track).toMatchObject({ title: "Feeling Good", artist: "Nina Simone", trackNo: 3, source: { kind: "copied" } });
    expect(await library.storedFile(track.id)).toBeDefined();
  });

  it("skips files already in the library", async () => {
    const { library, importer } = await load();
    await importer.importFiles([audioFile("a.mp3")], () => {});
    const summary = await importer.importFiles([audioFile("a.mp3"), audioFile("b.mp3")], () => {});
    expect(summary).toMatchObject({ added: 1, duplicates: 1 });
    expect(library.getTracks()).toHaveLength(2);
  });

  it("turns an m3u into a playlist, matching folders when names repeat", async () => {
    const { library, importer } = await load();
    const m3u = new File(["#EXTM3U\nAlbum B/01 Intro.mp3\nMissing.mp3\n"], "Mix.m3u", { type: "audio/x-mpegurl" });
    Object.defineProperty(m3u, "webkitRelativePath", { value: "Music/Mix.m3u" });
    const summary = await importer.importFiles(
      [audioFile("01 Intro.mp3", "Music/Album A"), audioFile("01 Intro.mp3", "Music/Album B"), m3u],
      () => {},
    );
    // Same name and size, so the second "01 Intro.mp3" counts as a duplicate of the first.
    expect(summary.added).toBe(1);
    expect(summary).toMatchObject({ playlists: 1, missingEntries: 1 });
    const [playlist] = library.getPlaylists();
    expect(playlist.name).toBe("Mix");
    expect(playlist.trackIds).toHaveLength(1);
  });

  it("stops at the first out-of-space error and says so", async () => {
    vi.doMock("./library", async (original) => ({
      ...(await original<typeof import("./library")>()),
      addTrack: vi.fn().mockRejectedValue(new DOMException("Full", "QuotaExceededError")),
    }));
    const { importer } = await load();
    const progress = vi.fn();
    const summary = await importer.importFiles([audioFile("a.mp3"), audioFile("b.mp3"), audioFile("c.mp3")], progress);
    expect(summary).toMatchObject({ added: 0, outOfSpace: true, failed: ["a.mp3"] });
    vi.doUnmock("./library");
  });

  it("stops between files when cancelled", async () => {
    const { importer } = await load();
    const controller = new AbortController();
    // Stopping while "b.mp3" is in progress lets it finish and skips the rest.
    const summary = await importer.importFiles(
      [audioFile("a.mp3"), audioFile("b.mp3"), audioFile("c.mp3")],
      (p) => p.current === "b.mp3" && controller.abort(),
      controller.signal,
    );
    expect(summary.added).toBe(2);
  });
});
