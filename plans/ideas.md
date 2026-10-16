# Feature ideas

The backlog from a review of the app on 2026-10-16. Each idea links to the wave plan that does it. Run `/do-next-wave plans/<file>.md` to work through a plan one wave at a time.

| Plan | Covers |
| --- | --- |
| [Navigation](wave-navigation.md) | Back button, keyboard, artists view |
| [Library](wave-library.md) | Play history, favourites, bulk actions, reorder, tag editing |
| [Playback](wave-playback.md) | Sleep timer, volume, lyrics, audiobooks, gapless |
| [Data and platform](wave-data.md) | Duplicates, backup, large libraries, file handlers, cover art |

Suggested order across plans: Navigation, then Library waves 1 and 2, then the rest as wanted. Each plan's waves are ordered so earlier ones make later ones safe.

## Navigation

- **Back button and history.** Views and dialogs live only in React state, so the Android back gesture and browser Back leave the app. Push a history entry per view change and per open sheet, and restore on `popstate`.
- **Keyboard gaps.** Slash should focus the page's search field and M should mute. Escape already closes the expanded player.
- **Artists view.** Songs sort by artist but there's no artist page. Add an Artists grid and an artist page listing albums, then songs not on an album.

## Library

- **Play history and favourites.** Store play count, last played and a liked flag on each song. That gives Recently played, Most played and Liked songs views, and a "Shuffle liked" button.
- **Album and playlist actions.** The song menu works per song only. Album and playlist pages need Play next, Add to queue and Add to playlist. The queue needs Save as playlist.
- **Multi-select.** Adding or removing many songs means one trip through the menu per song. A select mode on song lists with bulk Add to playlist, Add to queue and Remove fixes that.
- **Playlist reorder by drag.** Only Move up and Move down exist. Add drag to reorder, plus Move to top and Move to bottom for touch.
- **Tag editing.** Untagged files end up as "Unknown artist" with no way to fix them. An edit sheet for title, artist, album, album artist, track, disc and year, plus Set artwork from an image.

## Playback

- **Sleep timer.** Stop after a set time or at the end of the current song.
- **Volume.** A volume slider and mute on desktop. iOS ignores `audio.volume`, so hide it there.
- **Lyrics.** `music-metadata` exposes embedded lyrics. Store them at import and show them in the expanded player.
- **Audiobooks.** `.m4b` is accepted but has no speed control, no per-book resume and no chapters. Either support them properly or stop accepting `.m4b`.
- **Gapless playback.** One audio element swapping `src` leaves a gap between tracks. Live albums and mixes need a second element preloaded and swapped on end.

## Data and platform

- **Better duplicate detection.** Duplicates are matched by file name and size, so a renamed file imports twice. A hash of the first and last 64 KB catches that.
- **Export and backup.** Copied songs can exist only inside the app once the originals are deleted. Add playlist export to `.m3u` and a full library backup.
- **Large libraries.** Every song list renders every row. Virtualise long lists so ten thousand songs scroll smoothly on a phone.
- **File handlers.** Let desktop Chromium open audio files with TuneNook from the OS through the manifest's `file_handlers`.
- **Missing cover art.** Opt-in lookup from Cover Art Archive for albums with no embedded art. Needs a CSP change, and must stay off by default since the app is offline by design.
