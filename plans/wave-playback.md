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

## Wave 2: lyrics [skipped 2026-10-17]

Goal: show embedded lyrics.

Items:

1. Add optional `lyrics` to `Track`. At import in `src/lib/importer.ts`, read `common.lyrics` from `music-metadata`. Keep plain text only, and keep timestamps when the tag is synced.
2. Songs imported before this wave have no lyrics. Read them on first play, the same way `loadedmetadata` fills in a missing duration, and save them.
3. Add a Lyrics tab to the expanded player. Synced lyrics highlight and scroll with playback. Plain lyrics just scroll.

Risk: lyrics can be long. Storing them on the track object means they load with the whole library at start. If a library with lyrics on every song slows the first load, move them into their own store, which needs an IndexedDB version bump in `src/lib/db.ts`.

Exit criterion: standard check passes. A file with embedded lyrics shows them in the expanded player.

## Wave 3: audiobooks [skipped 2026-10-17]

Goal: `.m4b` files and long tracks behave like books, not songs.

Decide first whether to support audiobooks or drop `.m4b` from the accepted types in `src/components/AddMusic.tsx` and `src/lib/tags.ts`. The items below assume support.

Items:

1. Treat a track as long-form when it's an `.m4b` or longer than 20 minutes. Store `resumeAt` on it and resume from there, separately from the queue's saved position.
2. Add playback speed from 0.75x to 2x to the expanded player. Long-form tracks remember their own speed. Pass the rate to `publishPosition` so the lock screen scrubber stays right.
3. Read chapters with `music-metadata`'s `includeChapters` option and store them on the track. Show a chapter list in the expanded player, and make the lock screen's Previous and Next move between chapters on long-form tracks.
4. Swap the seek step to 30 seconds on long-form tracks.

Risk: changes what lock-screen Previous and Next do for these tracks. Check that's still sensible on iPhone.

Exit criterion: standard check passes. Play an `.m4b`, stop halfway through a chapter, play an album, then return to the book. It resumes where it stopped.

## Wave 4: gapless groundwork [skipped 2026-10-17]

Goal: prove Web Audio playback works on iPhone, and split the player so a second engine can sit beside the current one. No change people can hear yet.

Why not two audio elements: switching elements on `timeupdate` lands within about 250 ms of the end, which swaps the gap for a shorter gap or an overlap. MP3 and AAC files also carry encoder padding that an element can't trim. Joining songs exactly needs Web Audio, scheduling the next decoded song with `AudioBufferSourceNode.start(when)` at the sample where the current one ends.

Items:

1. Spike on a real iPhone, in a dev-only page. Route an `AudioContext` into a `MediaStreamAudioDestinationNode` and play that stream through the existing `<audio>` element (`srcObject`), so the OS still sees one media element. Check that it keeps playing with the screen locked and the silent switch on, that the lock screen shows Media Session metadata and its controls work, and that `AudioContext.resume()` inside a tap replaces the silent-WAV unlock. Measure memory with two decoded songs held at once.
2. If the spike fails on iOS, stop here and record what failed in this file. Gapless then ships on desktop only, or not at all.
3. In `src/lib/player.ts`, put the element code behind an `Engine` interface: load, play, pause, seek, position, duration, and ended, error and tick callbacks. Move today's code into `ElementEngine` with no change in behaviour. Things that hang off `timeupdate` today (listen counting, the sleep timer check, the position save, `publishPosition`) take the engine's tick instead.

Risk: the refactor touches every playback path. The existing player tests must pass unchanged, and the playback section of the iPhone check must pass before deploying.

Exit criterion: standard check passes. The spike's results are written into this file. Playback, the lock screen and the sleep timer behave as before on desktop Chrome and on iPhone.

## Wave 5: gapless playback [skipped 2026-10-17]

Goal: albums mastered without gaps play with no gap or click between tracks.

Needs wave 4, with the spike passed on iOS or a decision to ship on desktop only.

Items:

1. Add a `BufferEngine`. Decode with `decodeAudioData` from the blobs `prepare()` already loads, and decode the next song while the current one plays. Schedule the next song at the current one's exact end, and keep the position from `context.currentTime`. Hold only the current and next buffers. Ticks come from a timer reading `context.currentTime`, since `requestAnimationFrame` stops with the screen locked.
2. Use `BufferEngine` only for a join that needs it: the next song in the queue is the following track on the same album (by disc and track number), and both songs are under a length cap set from the spike's memory figures. Decoded stereo at 44.1 kHz takes about 21 MB a minute. Everything else stays on `ElementEngine`, and engines switch only at song boundaries.
3. Encoder padding. Check in Chrome and Safari whether `decodeAudioData` already trims the MP3 LAME delay and padding and the AAC `iTunSMPB` or edit-list padding. Where it doesn't, read the values at import and offset the start and end. Test with files whose padding is known.
4. Repeat one, shuffle changes, queue edits and a seek near the end must cancel the scheduled next source and schedule again.
5. Add a "Gapless playback" setting, on by default, that falls back to `ElementEngine` everywhere.

Risk: high. This is the core of playback. A scheduling mistake plays two songs at once or skips one, and iOS may stop Web Audio in the background in ways the spike missed. Run the whole iPhone check with the screen locked before shipping.

Exit criterion: standard check passes. A test pair made from one sine wave split into two WAV files joins without a click on desktop Chrome and Safari, and so does an LAME-encoded MP3 pair. An ordinary album and a shuffled queue play as before. The iPhone check passes with the screen locked.
