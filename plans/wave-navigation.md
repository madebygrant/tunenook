# Wave plan: navigation

Back button support, keyboard gaps and an Artists view. Backlog: [ideas.md](ideas.md).

Every wave ends with the standard check: `pnpm test && pnpm lint && pnpm build` passes.

## Wave 1: history and back button [done 2026-10-16]

Goal: browser Back and the Android back gesture move between views and close sheets instead of leaving the app.

Items:

1. Add `src/lib/history.ts`, which turns a `View` into a URL hash and back. Unknown or stale hashes fall back to Songs. Unit test the round trip for every view kind, including album keys with slashes, spaces and newlines.
2. In `src/App.tsx`, have `navigate` push a history entry, and listen for `popstate` to set the view. Read the initial view from the hash, keeping the current rule that an empty library opens Add music.
3. Open dialogs push an entry too, so Back closes the topmost one. Covers the expanded player in `src/components/Player.tsx`, the song menu, shortcuts and the nav drawer. Closing a dialog by its button or Escape must pop its entry, or Back needs two presses next time.
4. Album and playlist pages whose album or playlist no longer exists keep their current "no longer in your library" message when reached from history.

Risk: changes visible behaviour. The URL now shows a hash, and a page reload stays on the current view. Check the service worker's `navigateFallback` still serves the app with a hash.

Exit criterion: standard check passes. In Chrome with the Android emulation, open an album, open a song menu, then press Back twice. The menu closes, then the album list shows. A third Back from the first view leaves the app.

## Wave 2: keyboard gaps [done 2026-10-16]

Goal: slash focuses search and M mutes.

Items:

1. In `src/App.tsx`, slash focuses the current page's search field when there is one. Same guards as the existing `?` handler: no modifier keys, no open dialog, not typing in a field.
2. In `src/lib/player.ts`, add `toggleMute` and a mute state hook. Bind M in the player key handler in `src/components/Player.tsx`.
3. Add both keys to `src/components/Shortcuts.tsx`.

Exit criterion: standard check passes. On Songs, pressing slash focuses search. Pressing M during playback silences it and pressing it again restores it.

## Wave 3: artists view

Goal: browse by artist.

Items:

1. In `src/lib/library.ts`, add `groupArtists` and a `useArtists` hook, built in `publish` next to `albums`. Group by album artist, falling back to artist, so compilations stay under "Various artists". Unit test with a compilation and a song with no album.
2. Add `artists` and `artist` view kinds to `View` in `src/components/Sidebar.tsx`, a sidebar item, and hash support in `src/lib/history.ts` from wave 1.
3. Add `src/components/Artists.tsx` with a tile grid and search, reusing the album tile markup. Use the first album's art for the tile.
4. The artist page lists the artist's albums as tiles, then songs that have no album. Play and Shuffle play every song by the artist.
5. Add Go to artist to the song menu in `src/components/SongMenu.tsx`, and make the artist name in the expanded player link to the artist page.

Exit criterion: standard check passes. With a library holding a compilation album, the Artists view shows "Various artists" once, and opening an artist plays their songs in album order.
