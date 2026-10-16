# iPhone PWA check

Run against the deployed URL after a deploy that touches the service worker, playback, import or the shell. Desktop Chrome can't check these: it has no Home Screen install, no lock screen, and plays blob URLs differently.

## Install

- Safari shows the install hint on Add music; the installed app doesn't.
- Add to Home Screen shows the dark tile and the label "TuneNook".
- The status bar sits over `#06080c`. In landscape, nothing slides under the notch.

## Import

- Choose files opens the Files picker with multi-select. Import 50+ songs from iCloud Drive and On My iPhone, plus an .m3u.
- Albums group correctly and show artwork. The summary flags any file iOS can't play (try an .ogg).
- Storage says the browser won't clear it (persistence granted to the Home Screen app).
- A week later, the library is still there.

## Playback

- The first tap on a song plays it without a second tap, from Songs, an album, a playlist and the queue.
- Lock screen: artwork, title, artist, a scrubber that stops on pause, and Previous/Next track buttons (not ±seconds).
- With the screen locked, playback moves to the next song by itself, including across an album boundary in shuffle. Record what happens at the end of a long queue.
- Lock-screen Next and Previous work with the screen locked.
- Pause for 10+ minutes, then resume from the lock screen.
- Headphones unplugged pauses; AirPods double-tap skips.

## Offline and updates

- Airplane mode, cold launch from the Home Screen: library, artwork and playback all work.
- Deploy twice. Foreground the installed app: the update notice appears only while nothing is playing, and Reload keeps the queue.
