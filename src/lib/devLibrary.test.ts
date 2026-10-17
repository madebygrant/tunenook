import { describe, expect, it } from "vitest";
import { fakeTracks } from "./devLibrary";
import { groupAlbums, groupArtists } from "./library";

describe("fakeTracks", () => {
  it("groups into albums of ten and a few songs per artist with no album", () => {
    const tracks = fakeTracks(300);
    expect(new Set(tracks.map((t) => t.id)).size).toBe(300);
    const albums = groupAlbums(tracks);
    const tagged = albums.filter((a) => a.tracks[0].album);
    expect(tagged.every((a) => a.tracks.length <= 10)).toBe(true);
    expect(groupArtists(albums).length).toBe(10);
  });
});
