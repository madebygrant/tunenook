# Wave plan: playback

Sleep timer, volume, lyrics, audiobooks and gapless playback. Backlog: [ideas.md](ideas.md).

Every wave ends with the standard check: `pnpm test && pnpm lint && pnpm build` passes. Waves that touch the audio element also need the playback section of [iphone-pwa-check.md](iphone-pwa-check.md) run on a real iPhone before deploying.

## Wave 1: sleep timer and volume [done 2026-10-17]

Goal: the two small controls people expect.

Items:

1. In `src/lib/player.ts`, add a sleep timer with 15, 30, 45 and 60 minutes and "End of this song". Fade the volume over the last 10 seconds, then pause. Keep the deadline as a timestamp, not a countdown, because iOS throttles timers with the screen locked. Unit test the end-of-song option across a skip.
2. Add a timer button to the expanded player in `src/components/Player.tsx` that shows the time left while set.
3. Add a volume slider and mute button to the desktop dock. Hide both on iOS, where `audio.volume` is read-only. Remember the level in localStorage. If the navigation plan's wave 2 already added mute, reuse it.

Risk: iOS can't fade either, so the timer just pauses there. Check that pausing from a timer while locked updates the lock screen.

Exit criterion: standard check passes. A sleep timer set to end of song stops playback when the song ends instead of starting the next one.

## Wave 2: lyrics

Goal: show embedded lyrics.

Items:

1. Add optional `lyrics` to `Track`. At import in `src/lib/importer.ts`, read `common.lyrics` from `music-metadata`. Keep plain text only, and keep timestamps when the tag is synced.
2. Songs imported before this wave have no lyrics. Read them on first play, the same way `loadedmetadata` fills in a missing duration, and save them.
3. Add a Lyrics tab to the expanded player. Synced lyrics highlight and scroll with playback. Plain lyrics just scroll.

Risk: lyrics can be long. Storing them on the track object means they load with the whole library at start. If a library with lyrics on every song slows the first load, move them into their own store, which needs an IndexedDB version bump in `src/lib/db.ts`.

Exit criterion: standard check passes. A file with embedded lyrics shows them in the expanded player.

## Wave 3: audiobooks

Goal: `.m4b` files and long tracks behave like books, not songs.

Decide first whether to support audiobooks or drop `.m4b` from the accepted types in `src/components/AddMusic.tsx` and `src/lib/tags.ts`. The items below assume support.

Items:

1. Treat a track as long-form when it's an `.m4b` or longer than 20 minutes. Store `resumeAt` on it and resume from there, separately from the queue's saved position.
2. Add playback speed from 0.75x to 2x to the expanded player. Long-form tracks remember their own speed. Pass the rate to `publishPosition` so the lock screen scrubber stays right.
3. Read chapters with `music-metadata`'s `includeChapters` option and store them on the track. Show a chapter list in the expanded player, and make the lock screen's Previous and Next move between chapters on long-form tracks.
4. Swap the seek step to 30 seconds on long-form tracks.

Risk: changes what lock-screen Previous and Next do for these tracks. Check that's still sensible on iPhone.

Exit criterion: standard check passes. Play an `.m4b`, stop halfway through a chapter, play an album, then return to the book. It resumes where it stopped.

## Wave 4: gapless playback

Goal: no silence between tracks on albums mastered without gaps.

Items:

1. In `src/lib/player.ts`, keep a second audio element loaded with the next song. A few hundred milliseconds before the current one ends, start the next and swap which element is active.
2. The prefetch already keeps the next song's object URL ready, so reuse it. Repeat one, shuffle changes and queue edits must reload the standby element.
3. Move all event listeners, the Media Session handlers and the silent-unlock trick to work with whichever element is active.

Risk: high. This is the core of playback, and iOS may refuse to start the standby element while locked, or may count it as a second media session. Keep a single-element fallback behind a setting, and run the whole iPhone check before shipping.

Exit criterion: standard check passes. A gapless album plays across track changes without an audible gap on desktop Chrome, and the iPhone check passes with the screen locked.
