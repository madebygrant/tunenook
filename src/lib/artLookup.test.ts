import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { freshEnvironment, makeTrack } from "./testing";

beforeEach(freshEnvironment);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const image = () => new Response(new Blob(["jpeg"]), { status: 200, headers: { "content-type": "image/jpeg" } });
const missing = () => new Response(null, { status: 404 });

describe("artLookup", () => {
  it("is off by default and sends nothing while off", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const lookup = await import("./artLookup");
    expect(lookup.isArtLookupOn()).toBe(false);
    await expect(lookup.findCover("Innuendo", "Queen")).rejects.toBeInstanceOf(lookup.LookupOffError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("remembers the setting", async () => {
    (await import("./artLookup")).setArtLookup(true);
    vi.resetModules();
    expect((await import("./artLookup")).isArtLookupOn()).toBe(true);
  });

  it("quotes the album and artist so their punctuation can't change the search", async () => {
    const { releaseSearchUrl } = await import("./artLookup");
    const query = new URL(releaseSearchUrl('Say "Hi"', "AC/DC")).searchParams.get("query");
    expect(query).toBe('release:"Say \\"Hi\\"" AND artist:"AC/DC"');
  });

  it("tries each good match, then its release group, skipping covers that aren't there", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith("https://musicbrainz.org/")) {
        return json({
          releases: [
            { id: "r1", score: 100, "release-group": { id: "g1" } },
            { id: "r2", score: 90, "release-group": { id: "g1" } },
            { id: "weak", score: 40 },
          ],
        });
      }
      return url.includes("release-group/g1") ? image() : missing();
    });
    vi.stubGlobal("fetch", fetch);
    const lookup = await import("./artLookup");
    lookup.setArtLookup(true);
    expect(await lookup.findCover("Innuendo", "Queen")).toBeInstanceOf(Blob);
    expect(fetch.mock.calls.slice(1).map(([url]) => url)).toEqual([
      "https://coverartarchive.org/release/r1/front-500",
      "https://coverartarchive.org/release/r2/front-500",
      "https://coverartarchive.org/release-group/g1/front-500",
    ]);
  });

  it("waits a second between MusicBrainz searches", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => json({ releases: [] }));
    vi.stubGlobal("fetch", fetch);
    const lookup = await import("./artLookup");
    lookup.setArtLookup(true);
    const searches = [lookup.findCover("A", "B"), lookup.findCover("C", "D")];
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await Promise.all(searches)).toEqual([null, null]);
  });

  it("moves past a cover that fails and reports the failure only if nothing else works", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith("https://musicbrainz.org/")) return json({ releases: [{ id: "r1", score: 100 }, { id: "r2", score: 100 }] });
      return url.includes("/r1/") ? new Response(null, { status: 503 }) : image();
    });
    vi.stubGlobal("fetch", fetch);
    const lookup = await import("./artLookup");
    lookup.setArtLookup(true);
    expect(await lookup.findCover("A", "B")).toBeInstanceOf(Blob);
    fetch.mockImplementation(async (url: string) =>
      url.startsWith("https://musicbrainz.org/") ? json({ releases: [{ id: "r1", score: 100 }] }) : new Response(null, { status: 503 }),
    );
    await expect(lookup.findCover("A", "B")).rejects.toThrow(/couldn't answer just now \(503\)/);
  });

  it("follows the setting when another window changes it", async () => {
    const lookup = await import("./artLookup");
    lookup.setArtLookup(true);
    localStorage.removeItem("tunenook.artLookup");
    window.dispatchEvent(new StorageEvent("storage", { key: "tunenook.artLookup" }));
    expect(lookup.isArtLookupOn()).toBe(false);
  });
});

describe("saving found artwork", () => {
  async function setup() {
    const library = await import("./library");
    const importer = await import("./importer");
    const lookup = await import("./artLookup");
    await library.loadLibrary();
    for (const id of ["a", "b"]) await library.addTrack({ track: makeTrack(id, { album: "Innuendo", artist: "Queen", albumArtist: "Queen" }) });
    vi.spyOn(importer, "downscale").mockResolvedValue(new Blob(["small"]));
    vi.stubGlobal("fetch", async (url: string) =>
      url.startsWith("https://musicbrainz.org/") ? json({ releases: [{ id: "r1", score: 100 }] }) : image(),
    );
    lookup.setArtLookup(true);
    return { library, lookup, album: () => library.getAlbums().find((a) => a.title === "Innuendo")! };
  }

  it("keeps artwork set by hand while the lookup ran", async () => {
    const { library, lookup, album } = await setup();
    const before = album();
    await library.setAlbumArt(before.key, new Blob(["mine"]));
    const mine = library.getTrack("a")?.artId;
    expect(await lookup.findAlbumArt(before)).toBe("has-art");
    expect(library.getTrack("a")?.artId).toBe(mine);
  });

  it("still lands on the songs if the album was renamed while the lookup ran", async () => {
    const { library, lookup, album } = await setup();
    const before = album();
    await library.editTracks(new Map(["a", "b"].map((id) => [id, { album: "Innuendo (Remaster)" }])));
    expect(await lookup.findAlbumArt(before)).toBe("found");
    expect(library.getTrack("b")?.artId).toMatch(/^art:/);
  });

  it("stops a bulk run at the first network failure and says how far it got", async () => {
    const { library, lookup } = await setup();
    await library.addTrack({ track: makeTrack("c", { album: "Jazz", artist: "Queen", albumArtist: "Queen" }) });
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);
    const message = await lookup.findMissingArt(() => {}, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(message).toBe("Stopped with 2 albums left. Couldn't reach MusicBrainz. Check the connection and try again.");
  });

  it("doesn't ask again about an album MusicBrainz had no match for", async () => {
    const { lookup, album } = await setup();
    vi.stubGlobal("fetch", async () => json({ releases: [] }));
    expect(await lookup.findAlbumArt(album())).toBe("none");
    expect(lookup.albumsToLookUp([album()])).toEqual([]);
  });
});
