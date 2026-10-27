# Wave plan: favourites

Favourite playlists and albums, and a Home page that shows them once any exist. Backlog: [ideas.md](ideas.md).

Every wave ends with the standard check: `pnpm test && pnpm lint && pnpm build` passes.

Albums aren't stored as records. `groupAlbums` in `src/lib/library.ts` builds them from tags, keyed by `trackAlbumKey`, so a favourite album is saved by its key and has to move when an edit renames the album. Playlists are stored records, so they carry a field.

## Wave 1: favourites in the library [done 2026-10-27]

Goal: favourites can be saved, loaded and listed, with no UI yet.

Items:

1. Add `favouredAt?: number` to `Playlist` in `src/lib/types.ts`. Like `Track.likedAt`, it's set while the playlist is a favourite, so the newest can come first. Save it through `savePlaylist`.
2. In `src/lib/db.ts`, add a `favourites` store with keyPath `key`, holding `{ key, at }` for albums, and raise `VERSION` from 3 to 4. `onupgradeneeded` already creates any missing store.
3. In `src/lib/library.ts`:
   - Load the store in `loadLibrary` and publish it with the rest.
   - Add `toggleFavouriteAlbum(key)` and `togglePlaylistFavourite(id)`, written like `toggleLike` with `now: true` and failure messages.
   - Add `useFavouriteAlbums()`, `useFavouritePlaylists()`, `hasFavourites()` and `useHasFavourites()`. Album favourites with no songs left are kept but not listed, so they come back if the songs are added again.
4. Add `moveFavouriteAlbum(from, to)`. If `to` is already a favourite, keep that one. Call it from `AlbumPage`'s `onSaved` in `src/components/Albums.tsx` when the key changes.
5. Unit test in `library.test.ts`:
   - Both kinds of favourite toggle and survive a reload.
   - A rename moves the album favourite.
   - A favourite album whose songs were all removed isn't listed.

Risk: a database version bump. A tab still open on version 3 gets the existing "open in another tab" message.

Exit criterion: standard check passes, and the new tests cover toggling, reload, rename and removed albums.

## Wave 2: marking favourites [done 2026-10-27]

Goal: albums and playlists can be favourited from their pages.

Items:

1. On `AlbumPage` (`src/components/Albums.tsx`) and `PlaylistPage` (`src/components/Playlists.tsx`), add a heart button to the header actions after Shuffle. Use `<Button small variant="ghost" icon={<HeartIcon filled={fav} />} aria-pressed={fav} aria-label="Favourite" />`.
2. Leave it off Liked songs, and off untagged groups (`isUntaggedGroup`), which aren't real albums.
3. Toggling it doesn't need a toast, since the heart changes. A failed save shows the library's error toast.

Exit criterion: standard check passes. In the browser, favourite an album and a playlist and reload. Both hearts are still filled.

## Wave 3: Home page [done 2026-10-27]

Goal: once a favourite exists, the app opens on a Home page that shows them.

Items:

1. Add `{ kind: "home" }` to `View` in `src/components/Sidebar.tsx`. Add `"home"` to `PLAIN_KINDS` in `src/lib/history.ts`, which gives it the `#/home` address.
2. Add `src/components/Home.tsx` with an `h1` "Home" and up to two sections, each shown only when it has entries:
   - "Playlists": `PlaylistTile` tiles, exported from `Playlists.tsx` with `playlistTracks`.
   - "Albums": `AlbumTile` tiles, with the Albums grid's note.
   - If the last favourite is removed while Home is open, show a short note and a button to Albums.
3. Route it in `src/App.tsx`. Albums opened from Home pass `from`, so Back returns to Home.
4. Add a "Home" item at the top of `ITEMS` in the sidebar, shown only while `useHasFavourites()` is true. Add a `HomeIcon` to `src/components/icons.tsx` in the same style as the other icons.
5. In `launchView`, open `{ kind: "home" }` when `hasFavourites()` is true. The library has already loaded at that point. `START_VIEW` stays Albums, so unknown addresses and libraries with no favourites behave as before.
6. Test that the app opens on Home only when a favourite exists, and that `#/home` round-trips in the history tests.

Risk: it changes where the app opens for anyone with a favourite. A saved address still wins over the front page, as now.

Exit criterion: standard check passes. In the browser with the chrome-devtools MCP:
- With one favourite, a fresh load opens Home with its tile, and Home is first in the sidebar.
- Removing the last favourite and reloading opens Albums, with no Home item.

## Wave 4: favourites in backups [done 2026-10-27]

Goal: a backup and restore keeps favourites.

Items:

1. In `src/lib/backup.ts`, add `favourite?: boolean` to each backed-up playlist and `favouriteAlbums?: string[]` at the top level. The format stays at version 1, and the new fields are optional so older backups still load.
2. `cleanPlaylist` keeps only a boolean `favourite`, and only strings are kept from `favouriteAlbums`.
3. Restore sets them. A restored playlist that's skipped as a copy of one already here keeps that playlist's own favourite.
4. Test in `backup.test.ts`:
   - Favourites survive a backup and restore.
   - A backup with neither field still restores.

Exit criterion: standard check passes, including the round trip and older-backup tests.
