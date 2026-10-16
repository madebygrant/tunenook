import { describe, expect, it } from "vitest";
import { libraryRemovalMessage } from "./removal";
import { makeTrack } from "./testing";

const linked = (id: string) => makeTrack(id, { source: { kind: "linked", folderId: "f", path: `${id}.mp3` } });

describe("libraryRemovalMessage", () => {
  it("keeps the single-song wording", () => {
    expect(libraryRemovalMessage([makeTrack("a")])).toBe(
      "This deletes TuneNook's copy of the song and removes it from every playlist. The original file isn't touched.",
    );
    expect(libraryRemovalMessage([linked("a")])).toBe("This removes the song from TuneNook and its playlists. The file in your folder stays.");
  });

  it("names both kinds when a selection mixes copied and linked songs", () => {
    const message = libraryRemovalMessage([makeTrack("a"), makeTrack("b"), linked("c")]);
    expect(message).toContain("copies of 2 songs");
    expect(message).toContain("1 linked song");
  });
});
