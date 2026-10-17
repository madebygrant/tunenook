# Wave plan: data and platform

Duplicate detection, export and backup, large libraries, file handlers and cover art lookup. Backlog: [ideas.md](ideas.md).

Every wave ends with the standard check: `pnpm test && pnpm lint && pnpm build` passes.

## Wave 1: large libraries [done 2026-10-17]

Goal: ten thousand songs scroll smoothly on a phone.

Items:

1. Generate a test library of 10,000 fake tracks behind a dev-only flag, so performance can be measured without real files.
2. Virtualise `src/components/SongList.tsx` for lists over a few hundred rows. Rows are a fixed height, so a small hand-written windowing component is enough without adding a dependency. Keep keyboard focus working when the focused row scrolls out of view.
3. Memoise the Songs filter and the album search in `src/components/Albums.tsx` so typing in search doesn't rebuild everything on each key.
4. Check the cost of `publish` in `src/lib/library.ts` during an import of 1,000 files, and batch further if it shows.

Exit criterion: standard check passes. With the test library, a Chrome performance trace of scrolling Songs on a mid-range phone emulation shows no frame over 50 ms.

## Wave 2: export and backup [done 2026-10-17]

Goal: get playlists and songs back out of the app.

Items:

1. Add `toM3u` to `src/lib/m3u.ts`, writing each song's path as `matchEntries` reads it, so an export re-imports cleanly. Unit test the round trip.
2. Add Export to the playlist page. It downloads a `.m3u8` file.
3. Add a Backup panel to Add music. On Chromium, pick a folder and write every copied song plus `tunenook-backup.json` holding tracks and playlists. Elsewhere, offer a zip download of playlists and metadata only, since a zip of all audio won't fit in memory on a phone.
4. Restoring a backup is importing its folder. Make the importer read `tunenook-backup.json` when present, so playlists and likes come back.

Risk: writes to the user's disk. Never overwrite existing files in the picked folder. Skip or rename instead.

Exit criterion: standard check passes. Back up a library to a folder, clear site data, import the folder, and the songs and playlists come back.

## Wave 3: better duplicate detection [done 2026-10-17]

Goal: a renamed file isn't imported twice.

Items:

1. Add `contentKey` to `Track`: the file size plus a SHA-256 of the first and last 64 KB. Compute it at import in `src/lib/importer.ts`. Unit test that a renamed copy gives the same key and a different file doesn't.
2. Treat a pick as a duplicate when either `sourceKey` or `contentKey` matches.
3. Existing songs have no `contentKey`. Fill it in during idle time from the stored files, and for linked songs only while folder access is granted.
4. Update `bytesToImport` so its space estimate still skips likely duplicates. It can only check `sourceKey` before reading files, so say that in the warning dialog's numbers rather than guessing.

Risk: the backfill reads every stored file once. Run it in small batches, pause during playback on iOS, and make it resumable.

Exit criterion: standard check passes. Rename a song's file, import it again, and the summary counts it as a duplicate.

## Wave 4: file handlers [done 2026-10-17]

Goal: open audio files with TuneNook from the desktop.

Items:

1. Add `file_handlers` for the audio types in `ACCEPT` to the manifest in `vite.config.ts`, with an action URL inside the app scope.
2. On launch, read files from `launchQueue`. Ask whether to copy them into the library or just play them now. Playing now holds them in memory for this session only.
3. Show the install prompt hint on Add music when file handlers would work but the app isn't installed.

Exit criterion: standard check passes. In installed Chrome on macOS, "Open with TuneNook" on an mp3 plays it.

## Wave 5: cover art lookup

Goal: fill in missing album art, only when the user asks.

Items:

1. Add a setting, off by default, that allows looking up missing album art online. Explain that it sends album and artist names to MusicBrainz.
2. When on, offer "Find artwork" on album pages without art. Search MusicBrainz for the release, fetch the front cover from Cover Art Archive, downscale it, and store it under the album's art id. Respect MusicBrainz's one request per second limit and send a proper User-Agent.
3. Add a bulk "Find missing artwork" job on Add music using `runJob`.
4. Allow `musicbrainz.org` and `coverartarchive.org` plus its image redirect host in `connect-src` and `img-src` in `public/_headers`.

Risk: first network use in an app sold as offline and private. Keep it opt-in, never run it automatically, and make it obvious when it's on.

Exit criterion: standard check passes. With the setting on, an album with no embedded art gets a cover from Find artwork, and with it off no request leaves the app.
