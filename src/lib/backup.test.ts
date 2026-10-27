import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { backupPaths, buildBackup, isBackupFile, parseBackup, playlistFiles, restorePlan } from "./backup";
import { m3uEntries } from "./m3u";
import { freshEnvironment, makeTrack } from "./testing";
import type { Playlist } from "./types";

beforeEach(freshEnvironment);

const playlist = (name: string, trackIds: string[]): Playlist => ({ id: name, name, trackIds, createdAt: 1, updatedAt: 1 });

describe("backupPaths", () => {
  it("keeps folders, cleans names a file system would refuse, and numbers repeats", () => {
    const tracks = [
      makeTrack("a", { path: "Music/Album/01 Intro.mp3" }),
      makeTrack("b", { path: "01 Intro.mp3" }),
      makeTrack("c", { path: "01 intro.MP3" }),
      makeTrack("d", { path: "../What? Now.mp3" }),
    ];
    expect([...backupPaths(tracks).values()]).toEqual(["Music/Album/01 Intro.mp3", "01 Intro.mp3", "01 intro (2).MP3", "_/What_ Now.mp3"]);
  });
});

describe("backup and restore", () => {
  const before = [
    makeTrack("a", { path: "Album/01 One.mp3", title: "One (fixed)", album: "Album", likedAt: 5, playCount: 3, lastPlayedAt: 9, addedAt: 2 }),
    makeTrack("b", { path: "Album/02 Two.mp3", title: "Two", album: "Album" }),
  ];
  const plays = [
    { id: "p1", trackId: "a", at: 7 },
    { id: "p2", trackId: "gone", at: 8 },
    { id: "p3", trackId: "a", at: 9 },
  ];
  const removed = new Map([["gone", { id: "gone", title: "Old", artist: "Band", album: "", albumArtist: "Band", removedAt: 8 }]]);
  const backup = buildBackup(before, [playlist("Mix", ["b", "a", "b"])], backupPaths(before), 100, { plays, removed, favouriteAlbums: new Map() });

  it("survives JSON and is found by name", () => {
    expect(parseBackup(JSON.stringify(backup))).toEqual(JSON.parse(JSON.stringify(backup)));
    expect(parseBackup('{"app":"other"}')).toBeNull();
    const bad = { ...backup, tracks: [null, { title: "No path" }, { ...backup.tracks[0], title: { x: 1 }, addedAt: "soon" }], playlists: [{ name: "P", paths: "nope" }] };
    const parsed = parseBackup(JSON.stringify(bad))!;
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].title).toBeUndefined();
    expect(parsed.tracks[0].addedAt).toBeUndefined();
    expect(parsed.playlists).toEqual([]);
    expect(isBackupFile("tunenook-backup (3).json")).toBe(true);
    expect(isBackupFile("notes.json")).toBe(false);
  });

  it("writes playlist copies that point back at the songs from the Playlists folder", () => {
    const [file] = playlistFiles(backup);
    expect(file.name).toBe("Mix.m3u8");
    expect(m3uEntries(file.text)).toEqual([
      ["..", "album", "02 two.mp3"],
      ["..", "album", "01 one.mp3"],
      ["..", "album", "02 two.mp3"],
    ]);
  });

  it("matches songs imported from the backup folder and plans their likes, edits and playlists", () => {
    // Imported again from the folder, with the file's own tags and new ids.
    const after = [
      makeTrack("x", { path: "Backup/Album/01 One.mp3", title: "One", album: "Album" }),
      makeTrack("y", { path: "Backup/Album/02 Two.mp3", title: "Two", album: "Album" }),
    ];
    const plan = restorePlan(backup, after, new Set(["x", "y"]));
    expect(plan.tags).toEqual(new Map([["x", { title: "One (fixed)" }]]));
    expect(plan.stats.get("x")).toEqual({ addedAt: 2, likedAt: 5, playCount: 3, lastPlayedAt: 9 });
    expect(plan.plays).toEqual([
      { trackId: "x", at: 7 },
      { trackId: "x", at: 9 },
    ]);
    expect(plan.removed).toEqual([{ song: { title: "Old", artist: "Band", album: "", albumArtist: "Band", removedAt: 8 }, plays: [8] }]);
    expect(plan.playlists).toEqual([{ name: "Mix", ids: ["y", "x", "y"], missing: 0 }]);
  });

  it("does nothing when the import brought none of the backup's songs, as when a linked folder is rescanned", () => {
    const after = [makeTrack("old", { path: "Album/01 One.mp3", title: "One" }), makeTrack("new", { path: "Other/x.mp3" })];
    const plan = restorePlan(backup, after, new Set(["new"]));
    expect(plan).toEqual({ tags: new Map(), stats: new Map(), plays: [], removed: [], playlists: [], favouriteAlbums: [] });
  });

  it("treats hand-edited play lists that aren't lists of numbers as no plays", () => {
    const edited = JSON.parse(JSON.stringify(backup));
    edited.tracks[0].plays = { at: 7 };
    edited.tracks[1].plays = [1, "2", null];
    edited.removed = [{ title: "Old", plays: "8" }, null];
    const after = [makeTrack("x", { path: "Album/01 One.mp3" }), makeTrack("y", { path: "Album/02 Two.mp3" })];
    const plan = restorePlan(edited, after, new Set(["x", "y"]));
    expect(plan.plays).toEqual([{ trackId: "y", at: 1 }]);
    expect(plan.removed).toEqual([]);
  });

  it("doesn't take a same-named file from another album or one of another size", () => {
    const after = [
      makeTrack("elsewhere", { path: "Backup/Other album/01 One.mp3" }),
      makeTrack("resized", { path: "Backup/Album/02 Two.mp3", size: 999, sourceKey: "02 Two.mp3\n999" }),
    ];
    expect(restorePlan(backup, after, new Set(["elsewhere", "resized"])).stats.size).toBe(0);
  });

  it("matches a song whose stored copy dropped its cover by the size the file had", () => {
    const after = [makeTrack("slim", { path: "Backup/Album/02 Two.mp3", size: 2, sourceKey: "02 Two.mp3\n3" })];
    expect([...restorePlan(backup, after, new Set(["slim"])).stats.keys()]).toEqual(["slim"]);
  });

  it("keeps a linked song's own path, so it matches the original file and not a cleaned-up name", () => {
    const linked = makeTrack("l", { source: { kind: "linked", folderId: "f", path: "What? Now.mp3" } });
    expect(buildBackup([linked], [], new Map(), 1).tracks[0].path).toBe("What? Now.mp3");
  });

  it("restores into the library once, even if the same backup is added twice", async () => {
    const library = await import("./library");
    const { restoreBackup } = await import("./backup");
    await library.loadLibrary();
    await library.addTrack({ track: makeTrack("x", { path: "Backup/Album/01 One.mp3", title: "One", album: "Album" }) });
    await library.addTrack({ track: makeTrack("y", { path: "Backup/Album/02 Two.mp3", title: "Two", album: "Album" }) });
    expect(await restoreBackup(backup, new Set(["x", "y"]))).toEqual({ restored: 2, playlists: 1, missing: 0 });
    expect(library.getTrack("x")).toMatchObject({ title: "One (fixed)", likedAt: 5, playCount: 3 });
    expect(library.getPlaylists().map((p) => p.trackIds)).toEqual([["y", "x", "y"]]);
    expect((await restoreBackup(backup, new Set())).playlists).toBe(0);
    expect(library.getPlaylists()).toHaveLength(1);
  });
});

describe("importExtras", () => {
  it("skips the backup's own playlist copies but adds other playlists in the pick", async () => {
    const library = await import("./library");
    const { importExtras, emptySummary } = await import("./importer");
    await library.loadLibrary();
    await library.addTrack({ track: makeTrack("x", { path: "Music/Backup/Album/01 One.mp3" }) });
    await library.addTrack({ track: makeTrack("y", { path: "Music/Backup/Album/02 Two.mp3" }) });
    const saved = buildBackup(
      [makeTrack("a", { path: "Album/01 One.mp3" }), makeTrack("b", { path: "Album/02 Two.mp3" })],
      [playlist("Mix", ["a", "b"])],
      new Map(),
      1,
    );
    const file = (name: string, text: string) => new File([text], name);
    const summary = { ...emptySummary(), addedIds: ["x", "y"] };
    await importExtras(
      [
        { file: file("tunenook-backup.json", JSON.stringify(saved)), path: "Music/Backup/tunenook-backup.json" },
        { file: file("Copy.m3u8", "../Album/02 Two.mp3\n"), path: "Music/Backup/Playlists/Copy.m3u8" },
        { file: file("Other.m3u8", "Backup/Album/02 Two.mp3\n"), path: "Music/Other.m3u8" },
      ],
      summary,
    );
    expect(library.getPlaylists().map((p) => p.name)).toEqual(["Mix", "Other"]);
    expect(summary.restored).toBe(2);
  });
});

describe("restorePlan with copies", () => {
  it("finds a backup song skipped as a copy under its picked path", () => {
    const saved = [makeTrack("a", { path: "Album/01 One.mp3" })];
    const backup = buildBackup(saved, [playlist("Mix", ["a"])], new Map(), 1);
    const existing = makeTrack("old", { path: "Elsewhere/One.mp3" });
    const plan = restorePlan(backup, [existing], new Set(), [{ path: "Backup/Album/01 One.mp3", id: "old" }]);
    expect(plan.stats.size).toBe(0);
    expect(plan.playlists).toEqual([{ name: "Mix", ids: ["old"], missing: 0 }]);
  });
});

describe("favourites in backups", () => {
  const songs = [
    makeTrack("a", { path: "Album/01 One.mp3", album: "Album" }),
    makeTrack("b", { path: "Album/02 Two.mp3", album: "Album" }),
  ];
  const restored = () => [
    makeTrack("x", { path: "Backup/Album/01 One.mp3", album: "Album" }),
    makeTrack("y", { path: "Backup/Album/02 Two.mp3", album: "Album" }),
  ];

  it("brings back favourite playlists and albums with their times", async () => {
    const library = await import("./library");
    const { restoreBackup } = await import("./backup");
    const lists = [{ ...playlist("Mix", ["a", "b"]), favouredAt: 4 }, playlist("Other", ["b"])];
    const saved = buildBackup(songs, lists, backupPaths(songs), 100, { plays: [], removed: new Map(), favouriteAlbums: new Map([["album", 3]]) });
    const backup = parseBackup(JSON.stringify(saved))!;
    await library.loadLibrary();
    for (const track of restored()) await library.addTrack({ track });
    await restoreBackup(backup, new Set(["x", "y"]));
    expect(library.getPlaylists().map((p) => [p.name, p.favouredAt])).toEqual([
      ["Mix", 4],
      ["Other", undefined],
    ]);
    expect(library.getFavouriteAlbums()).toEqual(new Map([["album", 3]]));
  });

  it("restores a backup made before favourites, and drops hand-edited favourites of the wrong shape", async () => {
    const library = await import("./library");
    const { restoreBackup } = await import("./backup");
    const old = JSON.parse(JSON.stringify(buildBackup(songs, [playlist("Mix", ["a"])], backupPaths(songs), 100))) as Record<string, unknown>;
    delete old.favouriteAlbums;
    old.playlists = [{ name: "Mix", paths: ["Album/01 One.mp3"], favouredAt: "yes" }];
    const backup = parseBackup(JSON.stringify(old))!;
    expect(parseBackup(JSON.stringify({ ...old, favouriteAlbums: [{ key: "album" }, "album", { key: 1, at: 2 }] }))!.favouriteAlbums).toEqual([]);
    await library.loadLibrary();
    for (const track of restored()) await library.addTrack({ track });
    expect((await restoreBackup(backup, new Set(["x", "y"]))).playlists).toBe(1);
    expect(library.getPlaylists()[0].favouredAt).toBeUndefined();
    expect(library.getFavouriteAlbums().size).toBe(0);
  });

  it("favourites only albums the restore brought songs back to", async () => {
    const library = await import("./library");
    const { restoreBackup } = await import("./backup");
    const favourites = new Map([["album", 3], ["other", 2]]);
    const saved = buildBackup(songs, [], backupPaths(songs), 100, { plays: [], removed: new Map(), favouriteAlbums: favourites });
    await library.loadLibrary();
    await library.addTrack({ track: makeTrack("o", { path: "Elsewhere/Other.mp3", album: "Other" }) });
    for (const track of restored()) await library.addTrack({ track });
    await restoreBackup(parseBackup(JSON.stringify(saved))!, new Set(["x", "y"]));
    expect(library.getFavouriteAlbums()).toEqual(new Map([["album", 3]]));
  });

  it("leaves an album unfavourited since the backup alone when the backup folder is added again", async () => {
    const library = await import("./library");
    const { restoreBackup } = await import("./backup");
    const saved = buildBackup(songs, [], backupPaths(songs), 100, { plays: [], removed: new Map(), favouriteAlbums: new Map([["album", 3]]) });
    await library.loadLibrary();
    for (const track of restored()) await library.addTrack({ track });
    // Picked again, the files are skipped as copies of the songs already here.
    const copies = [{ path: "Backup/Album/01 One.mp3", id: "x" }, { path: "Backup/Album/02 Two.mp3", id: "y" }];
    await restoreBackup(parseBackup(JSON.stringify(saved))!, new Set(), copies);
    expect(library.getFavouriteAlbums().size).toBe(0);
  });
});
