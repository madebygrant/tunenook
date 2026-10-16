import { describe, expect, it } from "vitest";
import { guessFromFileName, isAudioFile } from "./tags";

describe("guessFromFileName", () => {
  it("splits track number, artist and title", () => {
    expect(guessFromFileName("03 - Nina Simone - Feeling Good.mp3")).toEqual({
      trackNo: 3,
      artist: "Nina Simone",
      title: "Feeling Good",
    });
  });

  it("reads a bare numbered title", () => {
    expect(guessFromFileName("07 Clair de lune.flac")).toEqual({ trackNo: 7, artist: null, title: "Clair de lune" });
  });

  it("keeps dashes after the first in the title", () => {
    expect(guessFromFileName("Artist - Song - Live.m4a").title).toBe("Song - Live");
  });

  it("doesn't treat a numeric title as a track number", () => {
    expect(guessFromFileName("1979.mp3")).toEqual({ trackNo: null, artist: null, title: "1979" });
  });
});

describe("isAudioFile", () => {
  it("accepts audio types and known extensions with no type", () => {
    expect(isAudioFile({ name: "a.mp3", type: "audio/mpeg" })).toBe(true);
    expect(isAudioFile({ name: "a.m4a", type: "" })).toBe(true);
    expect(isAudioFile({ name: "cover.jpg", type: "image/jpeg" })).toBe(false);
    expect(isAudioFile({ name: "Mix.m3u", type: "audio/x-mpegurl" })).toBe(false);
  });
});
