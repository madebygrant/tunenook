import { describe, expect, it } from "vitest";
import { m3uEntries, matchEntries, playlistName } from "./m3u";

describe("m3u", () => {
  it("reads file names from paths and skips comments", () => {
    const text = "#EXTM3U\r\n#EXTINF:123,Artist - Song\r\nMusic/Album/01%20Song.mp3\r\n\r\nC:\\Music\\Other.flac\n";
    expect(m3uEntries(text)).toEqual(["01 Song.mp3", "Other.flac"]);
  });

  it("matches by file name ignoring case and counts misses", () => {
    const tracks = [
      { id: "1", fileName: "01 Song.MP3" },
      { id: "2", fileName: "Other.flac" },
    ];
    expect(matchEntries(["01 song.mp3", "Gone.mp3", "Other.flac"], tracks)).toEqual({ ids: ["1", "2"], missing: 1 });
  });

  it("names the playlist after the file", () => {
    expect(playlistName("Road trip.m3u8")).toBe("Road trip");
  });
});
