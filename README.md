# TuneNook

An offline music player for your own files, installable as a PWA. Songs, artwork and playlists live in IndexedDB on the device; there's no server and no account. The only network calls are the optional online artwork lookup (MusicBrainz and the Cover Art Archive), which is off until you turn it on in Add music. The design and app shell come from Podnook (`../podnook`), and `DESIGN.md` has the design rules.

## Getting music in

- **Copy in (every browser, including iPhone):** Add music → Choose files, or Choose a folder on desktop. Files are copied into the app, tags and cover art are read with `music-metadata`, and `.m3u`/`.m3u8` files picked alongside become playlists (matched by file name).
- **Play in place (Chrome and Edge):** Link a folder plays files where they are using the File System Access API. The browser asks for access again each session. Copy into TuneNook later moves a linked folder or song into the app's storage under the same song id, so playlists and the queue keep working.

## Storage, backup and export

- **Smaller copies:** once a song's cover is saved separately, the copy in storage has its embedded cover removed (MP3, FLAC and M4A). A background pass does the same for songs added before this. Exporting puts the cover back.
- **Storage page:** shows what's using space, the largest albums, songs and playlists, and holds Back up. Backup writes songs, playlists, likes, play counts and edits to a folder on Chrome and Edge; elsewhere it's a zip without the songs. To restore, add the backup folder with Choose a folder.
- **Export:** Export song… in a song's menu, or Export songs… in an album's or playlist's, turns copied songs back into audio files with their covers, through the share sheet, a folder, or downloads.

## Playback

- **Sleep timer:** 15 minutes to 2 hours, or the end of the song or album. Timed stops fade out over the last three minutes. iOS ignores a web page's volume, so there the fade goes through Web Audio, set up the first time a timed sleep timer is chosen.
- **Output:** in Safari, the full player's output button opens the system list of AirPlay speakers and Bluetooth headphones.

## iPhone limits

- Web apps can't read the Music app library, and can't keep a reference to a file in Files, so songs are copied in and take space twice until you delete the originals.
- Install to the Home Screen before importing: the installed app's storage is separate from Safari's.
- Safari can clear a site's storage; the Home Screen app keeps it. Back up now and then, and keep the original files: backup without folder access doesn't include the songs.
- Playback with the screen locked, lock-screen track changes and the sleep timer's fade need checking on a real device; see `plans/iphone-pwa-check.md`. If the fade silences playback while locked, it's the Web Audio routing.

## Commands

```sh
pnpm dev       # dev server
pnpm test      # vitest
pnpm lint      # oxlint
pnpm build     # typecheck and build to dist/
pnpm preview   # build and serve dist/ with the service worker
pnpm run deploy  # build and deploy to Cloudflare as static assets
```

Deploying needs `wrangler login` once. Use `pnpm run deploy`: plain `pnpm deploy` is a pnpm built-in and skips the script. `public/_headers` sets the CSP; it allows `blob:` and `data:` media and images, which playback and artwork need.
