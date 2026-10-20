# Wave plan: native app

Wrap TuneNook in Capacitor so it runs as an iOS app, installed from Xcode. Planned 2026-10-19 from a code scan; start only once the PWA trial in [iphone-pwa-check.md](iphone-pwa-check.md) has gone well. Items marked "verify" are WKWebView behaviours to confirm on a device, not assume.

Every wave ends with the standard check: `pnpm test && pnpm lint && pnpm build` passes. The web build keeps deploying unchanged throughout.

Already in place: folder linking (`canLinkFolders`), the output picker (`canPickOutput`) and sharing (`canShareFiles`) are feature-detected, and `registerServiceWorker` in `src/lib/pwa.ts` does nothing without `serviceWorker`.

## Wave 1: a native switch in the web build

Goal: one place to ask "am I the app?", shipped and tested in the web build before Xcode is involved.

Items:

1. Add `src/lib/platform.ts` with an `isNative` flag read from Capacitor's global, so the web build needs no Capacitor package.
2. Add a native build mode: in `vite.config.ts`, leave out the PWA plugin and use relative asset paths. Add a `build:native` script beside `deploy`.
3. Behind `isNative`, hide what only makes sense on the web: `InstallHint.tsx`; the install prompts and "the browser may clear it" line in `StoragePage.tsx`; `canOpenWith` there and the `launchQueue` handling in `src/lib/launch.ts`; the update notice in `pwa.ts`.
4. Tests that each of those hides when `isNative` is true; extend `StoragePage.test.tsx`.

Risk: the storage page wording changes. Check it in the browser with the flag forced on.

Exit criterion: standard check passes, `pnpm build:native` writes `dist/` with no `sw.js`, and the deployed PWA is unchanged.

## Wave 2: shell and device spike

Goal: find out what WKWebView breaks before writing any native code. This is the go or no-go.

Items:

1. Add Capacitor and the iOS platform. `capacitor.config.ts` with `webDir: "dist"`, app id and name. Install to the phone from Xcode with a free Apple ID (installs last 7 days).
2. Enable the audio background mode in `Info.plist` and set the audio session to playback in the app delegate, or iOS stops sound in the background. Verify whether Capacitor needs this by hand.
3. Copy `iphone-pwa-check.md` to `iphone-native-check.md` and record:
   - Locked, playback moves to the next song. Lock-screen artwork and controls show; verify WKWebView passes Media Session (`src/lib/mediaSession.ts`) through.
   - Choose files opens the document picker with multi-select, and the import finishes.
   - IndexedDB keeps the library across force-quits and a reinstall from Xcode.
   - Online artwork reaches MusicBrainz from the `capacitor://localhost` origin; verify CORS.
   - The AirPlay picker (`webkitShowPlaybackTargetPicker` in `player.ts`) opens.
   - The sleep timer's Web Audio fade survives the lock screen.
   - Backup and export: verify. WKWebView ignores `<a download>` (`src/lib/download.ts`, `downloadFiles`) and may lack `navigator.share`; expect both to fail.

Risk: this is where native may prove not worth it. If background playback or the lock screen can't be fixed, mark waves 3 to 5 skipped.

Exit criterion: `iphone-native-check.md` filled in, with a clear yes or no for background playback and lock-screen controls.

## Wave 3: replace what the spike broke

Goal: native stand-ins for whatever failed in wave 2. Each item is conditional; mark it done if the spike found it working.

Items:

1. Saving files: write through `@capacitor/filesystem`, then hand to `@capacitor/share`, so "Save to Files" covers the backup zip (`backup.ts` via `download.ts`) and `downloadFiles`/`shareFiles` in `exportSongs.ts`. Web paths stay behind `isNative`.
2. Lock screen, if Media Session didn't come through: a Now Playing plugin fed from `publishMetadata`, `publishPlaybackState` and `publishPosition`, with its buttons calling the existing functions in `player.ts`.
3. External links (MusicBrainz attribution, any donation link) open through `@capacitor/browser`.
4. AirPlay, if the WebKit picker didn't open: a native route-picker button.

Risk: item 2 changes lock-screen behaviour. The plugin must report pause the way `publishPlaybackState` does, or the lock-screen scrubber keeps moving after a pause.

Exit criterion: the failed items in `iphone-native-check.md` pass, and the web build still passes the PWA check.

## Wave 4: native polish

Goal: make it look and open like an app.

Items:

1. App icon and a `#06080c` launch screen from `public/pwa-512x512.png` with `@capacitor/assets`.
2. Status bar through `@capacitor/status-bar`, matching `black-translucent`. Recheck safe areas on a notched phone.
3. Open in TuneNook from Files: register document types for the formats in `file_handlers` (`vite.config.ts`) and route opened files to the importer through `@capacitor/app`, the iOS counterpart of `launch.ts`.
4. Optional: light haptics through `@capacitor/haptics` on long-press and when the sleep timer stops playback.

Risk: item 3 touches the importer's entry point. Recheck that duplicate detection still catches a file already added.

Exit criterion: the app opens straight to a dark screen with the right icon, and an M4A opened from Files with Open in TuneNook is imported.

## Wave 5: moving in and docs

Goal: move a real library into the app and describe the finished state.

Items:

1. Migration path: the app can't read Safari's storage. Back up from the PWA (on iPhone, the zip without songs), re-add the original files in the app, and restore the zip alongside them. Test end to end with the real library.
2. README: a native section (build, run from Xcode, the 7-day reinstall), and update iPhone limits for what the app removes.
3. DESIGN.md wherever native differs: the output button, the storage panel copy, Open in.
4. Finalise `iphone-native-check.md` as the check before each native build.

Risk: migration is where data gets lost. Keep the PWA installed until the app has held the library for a week.

Exit criterion: the real library is in the app, moved using only the README's steps.

## Left out

- Native gapless playback and moving songs from IndexedDB to the file system: what native makes possible, not part of the wrap. They follow this plan, with the skipped gapless waves in [wave-playback.md](wave-playback.md).
- App Store submission, TestFlight and the US$99 programme: testing comes first.
- A donation link: none yet. Apple may reject external tip links in review.

## Why this order

The switch comes first because waves 3 to 5 branch on it, and building it in the web code means existing tests cover it and it ships harmlessly. The spike comes before native code because background playback and lock-screen controls decide whether native is worth it, and finding out costs an afternoon. Replacements follow the spike because only the spike says which are needed. Polish waits until the app works, and the migration write-up describes the state the other waves leave.

## What can slip

Waves 1 and 2 are non-negotiable: without them you can't tell if native is worth it. Wave 3 is required only for what the spike breaks, and saving files almost certainly is. Wave 4 can wait indefinitely. In wave 5, don't skip the migration test before relying on the app for the real library.
