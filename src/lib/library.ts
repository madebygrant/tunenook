import { useMemo, useSyncExternalStore } from "react";
import { get, getAll, write, type Write } from "./db";
import { newPlaylist, renamed, withoutTracks, withTracks } from "./playlists";
import { compareText } from "./format";
import { createListeners } from "./store";
import { albumKey } from "./tags";
import type { Album, Artist, LinkedFolder, Playlist, Track } from "./types";

// The live set of tracks. The arrays and maps handed to React are snapshots of it, rebuilt on publish.
const store = new Map<string, Track>();
// Songs opened with the installed app and played without adding. Outside store, so no list shows them and no write
// saves them; the id lookups the player and the queue use still find them.
const session = new Map<string, { track: Track; file: Blob }>();
const sessionArt = new Map<string, Blob>();
const artUsers = new Map<string, number>();
let tracks: Track[] = [];
let byId = new Map<string, Track>();
let albums: Album[] = [];
let artists: Artist[] = [];
let artistKeys = new Set<string>();
let dirty = false;
let playlists: Playlist[] = [];
let folders: LinkedFolder[] = [];
let loaded = false;
let loadError: string | null = null;
const { emit, subscribe } = createListeners();
const removedListeners = new Set<(ids: ReadonlySet<string>) => void>();
const errorListeners = new Set<(message: string) => void>();

function countArt(artId: string | null, delta: number): void {
  if (!artId) return;
  const n = (artUsers.get(artId) ?? 0) + delta;
  if (n > 0) artUsers.set(artId, n);
  else artUsers.delete(artId);
}

function putTrack(track: Track): void {
  countArt(store.get(track.id)?.artId ?? null, -1);
  store.set(track.id, track);
  countArt(track.artId, 1);
  dirty = true;
}

function dropTrack(id: string): void {
  countArt(store.get(id)?.artId ?? null, -1);
  store.delete(id);
  dirty = true;
}

// Rebuilding snapshots is O(n), so bulk imports batch it rather than paying it per file.
function publish(): void {
  if (dirty) {
    tracks = [...store.values()];
    byId = withSession(new Map(store));
    albums = groupAlbums(tracks);
    artists = groupArtists(albums);
    artistKeys = new Set(artists.map((a) => a.key));
    dirty = false;
  }
  emit();
}

let publishTimer: ReturnType<typeof setTimeout> | undefined;

function publishSoon(): void {
  publishTimer ??= setTimeout(() => {
    publishTimer = undefined;
    publish();
  }, 250);
}

function reportError(message: string, e: unknown): void {
  console.error(message, e);
  errorListeners.forEach((listener) => listener(message));
}

// Untagged songs get an empty album name in the key, so they never merge with an album really called "Unknown album".
export function trackAlbumKey(t: Pick<Track, "albumArtist" | "artist" | "album">): string {
  return albumKey(t.albumArtist || t.artist, t.album);
}

export function groupAlbums(list: Track[]): Album[] {
  const groups = new Map<string, Album>();
  for (const t of list) {
    const key = trackAlbumKey(t);
    let album = groups.get(key);
    if (!album) {
      album = { key, title: t.album || "Unknown album", artist: t.albumArtist || t.artist, year: t.year, artId: t.artId, tracks: [] };
      groups.set(key, album);
    }
    album.tracks.push(t);
    album.artId ??= t.artId;
    album.year ??= t.year;
  }
  for (const album of groups.values()) album.tracks.sort(byDiscAndTrack);
  return [...groups.values()].sort((a, b) => compareText(a.title, b.title) || compareText(a.artist, b.artist));
}

// The songs with no album tag, grouped by artist. They're never one album: each keeps its own cover and details.
// An album's tracks are either all untagged or all tagged, since untagged songs have their own key.
export function isUntaggedGroup(album: Album): boolean {
  return !album.tracks[0]?.album;
}

export function getAlbums(): Album[] {
  return dirty ? groupAlbums(getTracks()) : albums;
}

export function artistKey(name: string): string {
  return name.toLowerCase();
}

export function artistPageFor(t: Pick<Track, "artist">): string | null {
  const key = artistKey(t.artist);
  return artistKeys.has(key) ? key : null;
}

// Albums belong to their album artist, so a compilation is one "Various artists" entry. Each song's own artist
// also gets a page, listing the compilations they're on under appearsOn.
export function groupArtists(albums: Album[]): Artist[] {
  const groups = new Map<string, Artist>();
  const artistFor = (name: string) => {
    const key = artistKey(name);
    let artist = groups.get(key);
    if (!artist) {
      artist = { key, name, artId: null, albums: [], appearsOn: [], songs: [], tracks: [] };
      groups.set(key, artist);
    }
    return artist;
  };
  for (const album of albums) {
    const owner = artistFor(album.artist);
    const untagged = isUntaggedGroup(album);
    if (untagged) owner.songs.push(...album.tracks);
    else owner.albums.push(album);
    for (const t of album.tracks) {
      const guest = artistFor(t.artist);
      if (guest === owner) continue;
      if (untagged) guest.songs.push(t);
      else if (!guest.appearsOn.includes(album)) guest.appearsOn.push(album);
    }
  }
  const byYear = (a: Album, b: Album) => (a.year ?? Infinity) - (b.year ?? Infinity) || compareText(a.title, b.title);
  for (const artist of groups.values()) {
    artist.albums.sort(byYear);
    artist.appearsOn.sort(byYear);
    artist.songs.sort((a, b) => compareText(a.title, b.title));
    const own = (t: Track) => artistKey(t.artist) === artist.key;
    artist.tracks = [...artist.albums.flatMap((a) => a.tracks), ...artist.appearsOn.flatMap((a) => a.tracks.filter(own)), ...artist.songs];
    const art = [...artist.albums, ...artist.appearsOn, ...artist.songs].find((x) => x.artId);
    artist.artId = art?.artId ?? null;
  }
  return [...groups.values()].sort((a, b) => compareText(a.name, b.name));
}

export function byDiscAndTrack(a: Track, b: Track): number {
  return (a.discNo ?? 1) - (b.discNo ?? 1) || (a.trackNo ?? 1e6) - (b.trackNo ?? 1e6) || compareText(a.title, b.title);
}

export async function loadLibrary(): Promise<void> {
  try {
    const [t, p, f] = await Promise.all([getAll<Track>("tracks"), getAll<Playlist>("playlists"), getAll<LinkedFolder>("folders")]);
    t.forEach(putTrack);
    playlists = p.sort((a, b) => a.createdAt - b.createdAt);
    folders = f;
    loaded = true;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Storage is unavailable.";
    throw e;
  } finally {
    publish();
  }
}

export function getTracks(): Track[] {
  return dirty ? [...store.values()] : tracks;
}

export function getTrack(id: string): Track | undefined {
  return store.get(id) ?? session.get(id)?.track;
}

function withSession(map: Map<string, Track>): Map<string, Track> {
  for (const [id, s] of session) map.set(id, s.track);
  return map;
}

// art is the song's own cover, kept in memory for the session rather than saved. Only the id map changes, since no
// list shows these songs.
export function addSessionTracks(list: { track: Track; file: Blob; art?: Blob }[]): void {
  for (const { track, file, art } of list) {
    const artId = art ? `session:${track.id}` : track.artId;
    if (art && artId) sessionArt.set(artId, art);
    session.set(track.id, { track: { ...track, artId }, file });
  }
  byId = withSession(new Map(byId));
  emit();
}

// Playlists are saved and session songs aren't, so a saved playlist would point at nothing next time.
const savedOnly = (p: Playlist): Playlist =>
  p.trackIds.some((id) => session.has(id)) ? { ...p, trackIds: p.trackIds.filter((id) => !session.has(id)) } : p;

export function getPlaylists(): Playlist[] {
  return playlists;
}

export function getFolders(): LinkedFolder[] {
  return folders;
}

// The cover an album's songs already use, so an imported song joins it rather than bringing its own.
export function albumCover(key: string): string | null {
  for (const album of albums) if (album.key === key) return album.artId;
  return null;
}

export function hasArtist(key: string): boolean {
  return artistKeys.has(key);
}

export function hasAlbum(key: string): boolean {
  return albums.some((a) => a.key === key);
}

export function hasArt(artId: string): boolean {
  return artUsers.has(artId);
}

export function useTracks(): Track[] {
  return useSyncExternalStore(subscribe, () => tracks);
}

export function useTrackMap(): Map<string, Track> {
  return useSyncExternalStore(subscribe, () => byId);
}

export function useAlbums(): Album[] {
  return useSyncExternalStore(subscribe, () => albums);
}

export function useLikedTracks(): Track[] {
  const list = useTracks();
  return useMemo(
    () => list.filter((t) => t.likedAt !== undefined).sort((a, b) => (b.likedAt ?? 0) - (a.likedAt ?? 0)),
    [list],
  );
}

export function useArtists(): Artist[] {
  return useSyncExternalStore(subscribe, () => artists);
}

export function usePlaylists(): Playlist[] {
  return useSyncExternalStore(subscribe, () => playlists);
}

export function useFolders(): LinkedFolder[] {
  return useSyncExternalStore(subscribe, () => folders);
}

export function useLibraryLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded);
}

export function useLoadError(): string | null {
  return useSyncExternalStore(subscribe, () => loadError);
}

export function onTracksRemoved(listener: (ids: ReadonlySet<string>) => void): () => void {
  removedListeners.add(listener);
  return () => removedListeners.delete(listener);
}

// Edits made from a tap don't await their write, so failures are announced here instead.
export function onStorageError(listener: (message: string) => void): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

export interface NewTrack {
  track: Track;
  file?: Blob;
  art?: { id: string; blob: Blob };
}

// Song writes run one at a time, each built from the song as it stands when its turn comes, so a like can't
// resurrect a song removed just before it or be overwritten by a copy that started earlier.
let trackWrites: Promise<unknown> = Promise.resolve();

function queueTrackWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = trackWrites.then(task, task);
  trackWrites = run.catch(() => {});
  return run;
}

export function addTrack({ track, file, art }: NewTrack): Promise<void> {
  return queueTrackWrite(async () => {
    const writes: Write[] = [{ store: "tracks", op: "put", value: track }];
    if (file) writes.push({ store: "files", op: "put", key: track.id, value: file });
    // Songs from the same album imported before its cover turned up get it now.
    const backfill: string[] = [];
    if (art) {
      writes.push({ store: "art", op: "put", key: art.id, value: art.blob });
      if (art.id.startsWith("album:")) {
        const key = art.id.slice("album:".length);
        for (const t of store.values()) {
          if (t.artId || !t.album || albumKey(t.albumArtist || t.artist, t.album) !== key) continue;
          backfill.push(t.id);
          writes.push({ store: "tracks", op: "put", value: { ...t, artId: art.id } });
        }
      }
    }
    await write(writes);
    if (art) forgetArt(art.id);
    putTrack(track);
    for (const id of backfill) {
      const latest = store.get(id);
      if (latest && art) putTrack({ ...latest, artId: art.id });
    }
    publishSoon();
  });
}

// Applies the patch to the song as it stands when the write runs. False when the song has gone.
export function patchTrack(id: string, patch: Partial<Omit<Track, "id">>, extra: Write[] = []): Promise<boolean> {
  return queueTrackWrite(async () => {
    const current = store.get(id);
    if (!current) return false;
    await write([...extra, { store: "tracks", op: "put", value: { ...current, ...patch } }]);
    // Re-read, so a like made during the write survives.
    putTrack({ ...(store.get(id) ?? current), ...patch });
    publishSoon();
    return true;
  });
}

type TrackPatch = Partial<Omit<Track, "id">>;

// Memory first, so a tap shows at once and quick changes build on each other. One queued write saves whatever
// memory holds by then; if it fails, memory goes back to what storage has.
// quiet is for fields no screen shows: memory and storage update now, and showQuietChanges publishes them later.
export function updateTracks(
  patches: ReadonlyMap<string, TrackPatch>,
  options: { now?: boolean; quiet?: boolean; failure?: string } = {},
): Promise<boolean> {
  const ids = [...patches.keys()].filter((id) => store.has(id));
  if (ids.length === 0) return Promise.resolve(false);
  for (const id of ids) putTrack({ ...store.get(id)!, ...patches.get(id) });
  if (options.now) publish();
  else if (!options.quiet) publishSoon();
  return queueTrackWrite(async () => {
    const latest = ids.map((id) => store.get(id)).filter((t): t is Track => t !== undefined);
    if (latest.length === 0) return false;
    try {
      await write(latest.map((t) => ({ store: "tracks", op: "put", value: t })));
      return true;
    } catch (e) {
      const saved = await Promise.all(latest.map((t) => get<Track>("tracks", t.id).catch(() => undefined)));
      saved.forEach((t) => t && store.has(t.id) && putTrack(t));
      publish();
      if (options.failure) reportError(options.failure, e);
      else console.error("Couldn't update songs", e);
      return false;
    }
  });
}

// After a run of quiet updates, so the snapshots stop lagging the store and getTracks stops copying it.
export function showQuietChanges(): void {
  if (dirty) publishSoon();
}

export function updateTrack(id: string, patch: TrackPatch, options: { now?: boolean; failure?: string } = {}): Promise<boolean> {
  return updateTracks(new Map([[id, patch]]), options);
}

export type TagEdit = Partial<Pick<Track, "title" | "artist" | "album" | "albumArtist" | "trackNo" | "discNo" | "year">>;

// Art ids left with no songs by these changes, whose images can go.
function freeArt(changes: [from: string | null, to: string | null][]): string[] {
  const delta = new Map<string, number>();
  for (const [from, to] of changes) {
    if (from === to) continue;
    if (from) delta.set(from, (delta.get(from) ?? 0) - 1);
    if (to) delta.set(to, (delta.get(to) ?? 0) + 1);
  }
  return [...delta].filter(([id, d]) => d < 0 && (artUsers.get(id) ?? 0) + d <= 0).map(([id]) => id);
}

const newArtId = () => `art:${crypto.randomUUID()}`;

// The importer reuses an album:<key> image for that album, so a song leaving the album can't keep that id.
const namedForOtherAlbum = (artId: string | null, t: Track) => artId?.startsWith("album:") && artId !== `album:${trackAlbumKey(t)}`;

// Saves before touching memory, so a failed save changes nothing. A song moved to another album takes its cover,
// or keeps its own if that album has none. Untagged songs keep theirs.
export function editTracks(edits: ReadonlyMap<string, TagEdit>): Promise<boolean> {
  return queueTrackWrite(async () => {
    const moving = new Set([...edits.keys()].filter((id) => store.has(id)));
    if (moving.size === 0) return false;
    const covers = new Map<string, string>();
    for (const t of store.values()) {
      if (t.artId && !moving.has(t.id) && !covers.has(trackAlbumKey(t))) covers.set(trackAlbumKey(t), t.artId);
    }
    const copies = new Map<string, string>();
    const changes = [...moving].map((id) => {
      const before = store.get(id)!;
      const next = { ...before, ...edits.get(id) };
      const key = trackAlbumKey(next);
      let artId = next.album && key !== trackAlbumKey(before) ? (covers.get(key) ?? before.artId) : before.artId;
      if (artId && namedForOtherAlbum(artId, next)) {
        if (!copies.has(artId)) copies.set(artId, newArtId());
        artId = copies.get(artId)!;
      }
      return { before, next: { ...next, artId } };
    });
    const unusedArt = freeArt(changes.map(({ before, next }) => [before.artId, next.artId]));
    try {
      const images = await Promise.all([...copies].map(async ([from, to]) => [to, await get<Blob>("art", from)] as const));
      await write([
        ...images.filter(([, blob]) => blob).map(([key, value]): Write => ({ store: "art", op: "put", key, value })),
        ...changes.map(({ next }): Write => ({ store: "tracks", op: "put", value: next })),
        ...unusedArt.map((key): Write => ({ store: "art", op: "delete", key })),
      ]);
    } catch (e) {
      reportError("Couldn't save the changes. Nothing was changed.", e);
      return false;
    }
    unusedArt.forEach(forgetArt);
    // On the latest copy, so a like or play counted during the write survives.
    for (const { before, next } of changes) {
      putTrack({ ...(store.get(before.id) ?? before), ...edits.get(before.id), artId: next.artId });
    }
    publish();
    return true;
  });
}

// A fresh id per image, so covers already on screen under the old id needn't be reloaded in place.
export async function setAlbumArt(key: string, blob: Blob): Promise<boolean> {
  const ids = [...store.values()].filter((t) => trackAlbumKey(t) === key).map((t) => t.id);
  return (await setTracksArt(ids, blob)) === "saved";
}

export type ArtResult = "saved" | "has-art" | "gone" | "failed";

// By song id, so an album renamed meanwhile still gets it. ifMissing is for art found online: if any of the songs
// got a cover while the lookup ran, set by hand or imported, that one stays.
export function setTracksArt(ids: string[], blob: Blob, { ifMissing = false } = {}): Promise<ArtResult> {
  return queueTrackWrite(async (): Promise<ArtResult> => {
    const artId = newArtId();
    const songs = ids.flatMap((id) => store.get(id) ?? []);
    if (songs.length === 0) return "gone";
    if (ifMissing && songs.some((t) => t.artId)) return "has-art";
    const unusedArt = freeArt(songs.map((t) => [t.artId, artId]));
    try {
      await write([
        { store: "art", op: "put", key: artId, value: blob },
        ...songs.map((t): Write => ({ store: "tracks", op: "put", value: { ...t, artId } })),
        ...unusedArt.map((key): Write => ({ store: "art", op: "delete", key })),
      ]);
    } catch (e) {
      reportError("Couldn't save the artwork. Nothing was changed.", e);
      return "failed";
    }
    unusedArt.forEach(forgetArt);
    for (const t of songs) {
      const latest = store.get(t.id);
      if (latest) putTrack({ ...latest, artId });
    }
    publish();
    return "saved";
  });
}

export async function recordPlay(id: string): Promise<void> {
  const track = store.get(id);
  // A missed count isn't worth interrupting playback over, so failures are only logged.
  if (track) await updateTrack(id, { playCount: (track.playCount ?? 0) + 1, lastPlayedAt: Date.now() });
}

export async function toggleLike(id: string): Promise<void> {
  const track = store.get(id);
  if (!track) return;
  const liked = track.likedAt === undefined;
  await updateTrack(
    id,
    { likedAt: liked ? Date.now() : undefined },
    { now: true, failure: liked ? "Couldn't like the song." : "Couldn't unlike the song." },
  );
}

// Sets each song's likedAt, so a bulk unlike can be undone with the times it had.
export async function setLikes(likes: ReadonlyMap<string, number | undefined>): Promise<void> {
  const patches = new Map([...likes].map(([id, likedAt]) => [id, { likedAt }]));
  await updateTracks(patches, { now: true, failure: "Couldn't save the change to your likes." });
}

export function removeTracks(ids: ReadonlySet<string>): Promise<void> {
  if (ids.size === 0) return Promise.resolve();
  return queueTrackWrite(async () => {
    const now = Date.now();
    const gone = [...ids].map((id) => store.get(id)).filter((t): t is Track => t !== undefined);
    const changed = playlists.map((p) => withoutTracks(p, ids, now));
    const writes: Write[] = [];
    const freedArt = new Map<string, number>();
    for (const t of gone) {
      writes.push({ store: "tracks", op: "delete", key: t.id });
      // Linked tracks have no stored copy; their files on disk are never touched.
      if (t.source.kind === "copied") writes.push({ store: "files", op: "delete", key: t.id });
      if (t.artId) freedArt.set(t.artId, (freedArt.get(t.artId) ?? 0) + 1);
    }
    const unusedArt = [...freedArt].filter(([artId, n]) => (artUsers.get(artId) ?? 0) <= n).map(([artId]) => artId);
    unusedArt.forEach((artId) => writes.push({ store: "art", op: "delete", key: artId }));
    changed.forEach((p, i) => p !== playlists[i] && writes.push({ store: "playlists", op: "put", value: p }));
    await write(writes);
    unusedArt.forEach(forgetArt);
    gone.forEach((t) => dropTrack(t.id));
    playlists = changed;
    publish();
    removedListeners.forEach((listener) => listener(ids));
  });
}

// For taps that don't await: reports instead of rejecting.
export async function removeTracksSafely(ids: ReadonlySet<string>): Promise<void> {
  try {
    await removeTracks(ids);
  } catch (e) {
    reportError("Couldn't remove the song. Nothing was changed.", e);
  }
}

// Memory first, so quick edits build on each other; a failed write puts the old copy back.
export async function savePlaylist(next: Playlist): Promise<boolean> {
  const playlist = savedOnly(next);
  const before = playlists.find((p) => p.id === playlist.id);
  playlists = before ? playlists.map((p) => (p.id === playlist.id ? playlist : p)) : [...playlists, playlist];
  emit();
  try {
    await write([{ store: "playlists", op: "put", value: playlist }]);
    return true;
  } catch (e) {
    const current = playlists.find((p) => p.id === playlist.id);
    // A later edit may have landed since; only undo this one if it's still the latest.
    if (current === playlist) {
      playlists = before ? playlists.map((p) => (p.id === playlist.id ? before : p)) : playlists.filter((p) => p.id !== playlist.id);
      emit();
    }
    reportError("Couldn't save the playlist. The change was undone.", e);
    return false;
  }
}

export async function addToPlaylist(id: string, trackIds: string[]): Promise<boolean> {
  const p = playlists.find((x) => x.id === id);
  return p ? savePlaylist(withTracks(p, trackIds, Date.now())) : false;
}

export async function createPlaylist(name: string, trackIds: string[] = []): Promise<Playlist | null> {
  const playlist = newPlaylist(crypto.randomUUID(), name, trackIds, Date.now());
  return (await savePlaylist(playlist)) ? playlist : null;
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const p = playlists.find((x) => x.id === id);
  if (p) await savePlaylist(renamed(p, name, Date.now()));
}

export async function deletePlaylist(id: string): Promise<void> {
  try {
    await write([{ store: "playlists", op: "delete", key: id }]);
  } catch (e) {
    reportError("Couldn't delete the playlist.", e);
    return;
  }
  playlists = playlists.filter((p) => p.id !== id);
  emit();
}

export async function saveFolder(folder: LinkedFolder): Promise<void> {
  await write([{ store: "folders", op: "put", value: folder }]);
  folders = [...folders.filter((f) => f.id !== folder.id), folder];
  emit();
}

export async function deleteFolder(id: string): Promise<void> {
  await write([{ store: "folders", op: "delete", key: id }]);
  folders = folders.filter((f) => f.id !== id);
  emit();
}

export async function storedFile(id: string): Promise<Blob | undefined> {
  return session.get(id)?.file ?? get<Blob>("files", id);
}

const artUrls = new Map<string, Promise<string | null>>();

const artBlob = async (artId: string) => sessionArt.get(artId) ?? get<Blob>("art", artId);

export function artUrl(artId: string): Promise<string | null> {
  let url = artUrls.get(artId);
  if (!url) {
    url = artBlob(artId).then((blob) => (blob ? URL.createObjectURL(blob) : null));
    artUrls.set(artId, url);
  }
  return url;
}

function forgetArt(artId: string): void {
  void artUrls.get(artId)?.then((url) => url && URL.revokeObjectURL(url));
  artUrls.delete(artId);
}

// The lock screen gets a data URL: iOS doesn't reliably load blob: URLs for Media Session artwork.
export async function artDataUrl(artId: string): Promise<string | null> {
  const blob = await artBlob(artId);
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export function totalSeconds(list: Track[]): number {
  return list.reduce((sum, t) => sum + (t.duration ?? 0), 0);
}
