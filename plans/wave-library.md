# Wave plan: library

Play history, favourites, bulk actions, playlist reorder and tag editing. Backlog: [ideas.md](ideas.md).

Every wave ends with the standard check: `pnpm test && pnpm lint && pnpm build` passes.

New `Track` fields are optional, so songs saved before this plan still load. The `tracks` store keeps whole objects, so no IndexedDB version bump is needed.

## Wave 1: play history and favourites [done 2026-10-16]

Goal: the app knows what you play and what you like.

Items:

1. Add optional `playCount`, `lastPlayedAt` and `liked` to `Track` in `src/lib/types.ts`.
2. In `src/lib/player.ts`, count a play once a song passes half its length or 30 seconds, whichever comes first, once per load. Write it with `updateTrack`. Unit test the threshold and that seeking back doesn't count twice.
3. Add a like toggle in the expanded player and in the song menu. Bind L to it and list it in `src/components/Shortcuts.tsx`.
4. Add "Recently played" and "Most played" to the sort options in `src/components/Songs.tsx`.
5. Add a Liked songs entry at the top of Playlists. It behaves like a playlist page but is read-only and ordered by when each song was liked, so store `likedAt` rather than a boolean if that's simpler.

Risk: `updateTrack` on every play writes to IndexedDB during playback. Check it doesn't stall the audio on a phone with a large library, since `publishSoon` rebuilds the snapshots.

Exit criterion: standard check passes. Play a song past the threshold and it moves to the top of Recently played. Like it and it shows in Liked songs after a reload.

## Wave 2: album, playlist and queue actions [done 2026-10-16]

Goal: act on a whole album, playlist or queue at once.

Items:

1. Add a More button to the album and playlist page headers in `src/components/Albums.tsx` and `src/components/Playlists.tsx`. It opens a menu with Play next, Add to queue and Add to playlist.
2. Generalise the playlist picker in `src/components/SongMenu.tsx` to take a list of track ids instead of one track, and reuse it.
3. Add Save as playlist to the queue page in `src/components/Queue.tsx`. It saves the current song and everything up next, in play order.

Exit criterion: standard check passes. Adding an album to a new playlist from the album page puts every song in it in track order.

## Wave 3: multi-select [done 2026-10-16]

Goal: bulk edits without one menu trip per song.

Items:

1. Add a select mode to `src/components/SongList.tsx`. Rows show a checkbox and tapping a row toggles it instead of playing. Shift-click selects a range on desktop.
2. A bar replaces the page actions while selecting. It shows the count and offers Add to playlist, Play next, Add to queue and Remove. Remove means remove from library on Songs and albums, remove from playlist on a playlist, and remove from queue on the queue.
3. Remove from library confirms first and uses `removeTracksSafely` with the whole set. Playlist removal offers Undo through the existing toast.
4. Escape and the Back button from the navigation plan leave select mode.

Risk: removing from the library deletes stored copies and can't be undone. Keep the same confirm wording as the single-song remove.

Exit criterion: standard check passes. Select ten songs on Songs, add them to a new playlist, then remove three of them from that playlist and undo.

## Wave 4: playlist reorder

Goal: reorder a playlist by dragging.

Items:

1. Add Move to top and Move to bottom to the playlist song menu in `src/components/SongMenu.tsx`, using `moved` from `src/lib/playlists.ts`.
2. Add a drag handle to playlist rows. Use pointer events so mouse and touch share one path, and scroll the list when dragging near its edges. Keep Move up and Move down for keyboard and screen reader users.
3. Announce the new position to screen readers after a move.

Exit criterion: standard check passes. Drag a song from the bottom of a 30-song playlist to the top on a touch emulator, reload, and the order holds.

## Wave 5: tag editing

Goal: fix wrong or missing tags inside the app.

Items:

1. Add Edit details to the song menu. It opens a sheet with title, artist, album, album artist, track number, disc number and year. Save calls `replaceTrack`. The file itself isn't rewritten.
2. Editing album or album artist changes the album key. Recompute `artId` so the song joins its new album's art, and keep its old art only if no album art exists.
3. Add Set artwork to the album page. It picks an image, downscales it with the importer's `downscale`, and writes it under the album's art id for every song on the album.
4. Add Edit details for a whole album that sets album, album artist and year on every song at once.

Risk: changes data the user typed or imported. A typo in album artist splits an album, so show which album the song will join before saving.

Exit criterion: standard check passes. Change an untagged song's artist and album, and it appears under the new album with that album's artwork.
