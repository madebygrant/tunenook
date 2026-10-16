import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { copyIntoLibrary } from "./folders";
import { addTrack, createPlaylist, getPlaylists, getTrack, loadLibrary, saveFolder, storedFile } from "./library";
import type { Track } from "./types";

class FakeFile {
  getFile() {
    return Promise.resolve(new File(["abc"], "song.mp3", { type: "audio/mpeg" }));
  }
}

class FakeDir {
  queryPermission() {
    return Promise.resolve("granted");
  }
  getDirectoryHandle() {
    return Promise.resolve(this);
  }
  getFileHandle() {
    return Promise.resolve(new FakeFile());
  }
}

const track: Track = {
  id: "t1",
  title: "Song",
  artist: "Artist",
  album: "",
  albumArtist: "Artist",
  trackNo: null,
  discNo: null,
  year: null,
  duration: 3,
  artId: null,
  fileName: "song.mp3",
  size: 3,
  type: "audio/mpeg",
  addedAt: 1,
  sourceKey: "song.mp3\n3",
  source: { kind: "linked", folderId: "f1", path: "Album/song.mp3" },
};

describe("copyIntoLibrary", () => {
  beforeAll(async () => {
    await loadLibrary();
    await saveFolder({ id: "f1", name: "Music", handle: new FakeDir() as unknown as FileSystemDirectoryHandle, addedAt: 1 });
    await addTrack({ track });
    await createPlaylist("Mix", ["t1"]);
  });

  it("stores the file under the same id and keeps playlist membership", async () => {
    const result = await copyIntoLibrary([track], () => {});
    expect(result.copied).toBe(1);
    expect(getTrack("t1")?.source).toEqual({ kind: "copied" });
    expect(await storedFile("t1")).toBeDefined();
    expect(getPlaylists()[0].trackIds).toEqual(["t1"]);
  });
});
