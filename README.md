# TuneNook

An offline music player for your own files, installable as a PWA. Songs, artwork and playlists live in IndexedDB on the device; there's no server and no account. The design and app shell come from Podnook (`../podnook`), and `DESIGN.md` has the design rules.

## Getting music in

- **Copy in (every browser, including iPhone):** Add music → Choose files, or Choose a folder on desktop. Files are copied into the app, tags and cover art are read with `music-metadata`, and `.m3u`/`.m3u8` files picked alongside become playlists (matched by file name).
- **Play in place (Chrome and Edge):** Link a folder plays files where they are using the File System Access API. The browser asks for access again each session. Copy into TuneNook later moves a linked folder or song into the app's storage under the same song id, so playlists and the queue keep working.

## iPhone limits

- Web apps can't read the Music app library, and can't keep a reference to a file in Files, so songs are copied in and take space twice until you delete the originals.
- Install to the Home Screen before importing: the installed app's storage is separate from Safari's.
- Playback with the screen locked and lock-screen track changes need checking on a real device; see `plans/iphone-pwa-check.md`.

## Commands

```sh
pnpm dev       # dev server
pnpm test      # vitest
pnpm lint      # oxlint
pnpm build     # typecheck and build to dist/
pnpm preview   # build and serve dist/ with the service worker
pnpm deploy    # build and deploy to Cloudflare as static assets
```

Deploying needs `wrangler login` once. `public/_headers` sets the CSP; it allows `blob:` and `data:` media and images, which playback and artwork need.
