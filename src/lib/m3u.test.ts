import { describe, expect, it } from "vitest";
import { m3uEntries, matchEntries, playlistName, toM3u } from "./m3u";

describe("m3u", () => {
  it("reads paths, decodes them and skips comments", () => {
    const text = "#EXTM3U\r\n#EXTINF:123,Artist - Song\r\nMusic/Album/01%20Song.mp3\r\n\r\nC:\\Music\\Other.flac\n";
    expect(m3uEntries(text)).toEqual([
      ["music", "album", "01 song.mp3"],
      ["c:", "music", "other.flac"],
    ]);
  });

  it("matches by file name ignoring case and counts misses", () => {
    const candidates = [
      { id: "1", path: "01 Song.MP3", fresh: false },
      { id: "2", path: "Other.flac", fresh: false },
    ];
    expect(matchEntries(m3uEntries("01 song.mp3\nGone.mp3\nOther.flac"), candidates)).toEqual({ ids: ["1", "2"], missing: 1 });
  });

  it("picks the song whose folders match when file names repeat", () => {
    const candidates = [
      { id: "a", path: "Music/Album A/01 Intro.mp3", fresh: false },
      { id: "b", path: "Music/Album B/01 Intro.mp3", fresh: false },
    ];
    expect(matchEntries(m3uEntries("../Album B/01 Intro.mp3"), candidates).ids).toEqual(["b"]);
  });

  it("prefers a song from the same import when paths can't tell them apart", () => {
    const candidates = [
      { id: "old", path: "01 Intro.mp3", fresh: false },
      { id: "new", path: "01 Intro.mp3", fresh: true },
    ];
    expect(matchEntries(m3uEntries("01 Intro.mp3"), candidates).ids).toEqual(["new"]);
  });

  it("names the playlist after the file", () => {
    expect(playlistName("Road trip.m3u8")).toBe("Road trip");
  });

  it("exports paths that import back to the same songs, in order, with repeats", () => {
    const candidates = [
      { id: "a", path: "Music/Album A/01 Intro.mp3", fresh: false },
      { id: "b", path: "Music/Album B/01 Intro.mp3", fresh: false },
      { id: "c", path: "#1 hit 100%.flac", fresh: false },
    ];
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const order = ["b", "c", "a", "b"];
    const text = toM3u(order.map((id) => ({ path: byId.get(id)!.path, title: "Song\nTwo", artist: "Artist", duration: null })));
    expect(text.split("\n").filter((l) => l.startsWith("#EXTINF"))).toHaveLength(4);
    expect(matchEntries(m3uEntries(text), candidates)).toEqual({ ids: order, missing: 0 });
  });
});
