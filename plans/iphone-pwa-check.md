# iPhone PWA check

Run against the deployed URL after a deploy that touches the service worker, playback, import or the shell. Desktop Chrome can't check these: it has no Home Screen install, no lock screen, and plays blob URLs differently.

## Install

- Safari shows the install hint on Add music; the installed app doesn't.
- Add to Home Screen shows the dark tile and the label "TuneNook".
- The status bar sits over `#06080c`. In landscape, nothing slides under the notch.

## Import

- Choose files opens the Files picker with multi-select. Import 50+ songs from iCloud Drive and On My iPhone, plus an .m3u.
- Albums group correctly and show artwork. The summary flags any file iOS can't play (try an .ogg).
- The Storage page says the browser won't clear it (persistence granted to the Home Screen app).
- After the background pass, a few songs added with covers still play, and still show artwork in the app and on the lock screen.
- A week later, the library is still there.

## Playback

- The first tap on a song plays it without a second tap, from Songs, an album, a playlist and the queue.
- Lock screen: artwork, title, artist, a scrubber that stops on pause, and Previous/Next track buttons (not ±seconds).
- With the screen locked, playback moves to the next song by itself, including across an album boundary in shuffle. Record what happens at the end of a long queue.
- Lock-screen Next and Previous work with the screen locked.
- Pause for 10+ minutes, then resume from the lock screen.
- Headphones unplugged pauses; AirPods double-tap skips.
- The output button shows in the full player and opens the system list. Picking an AirPlay speaker lights the button; picking AirPods doesn't.

## Sleep timer

The fade on iPhone runs through Web Audio, which iOS might silence with the screen locked. These decide whether it stays.

- Play an album, set 15 minutes, and lock the phone straight away. Playback carries on past the lock and into the next song.
- From about 12 minutes the music fades evenly over three minutes, then stops. The next morning Play resumes with the volume back to normal.
- Same again on AirPods, then take a phone call during the timer: after the call, Play still has sound.
- With AirPlay on before setting a timer, playback stays on the speaker and stops at the end without a fade.
- End of this album appears when playing an album in order, not in a shuffled mixed playlist. It stops after the album's last song with the next song paused.
- The sheet marks the previous night's choice "Last time".

## Backup and export

- Back up downloads a zip; open it in Files and check it has the playlists and play history.
- Export songs… on an album: Share opens the share sheet, and Save to Files writes M4A files that show their cover in Files and play in the Files preview.
- Export of 20+ songs either shares or says to try fewer; it doesn't hang.

## Offline and updates

- Airplane mode, cold launch from the Home Screen: library, artwork and playback all work.
- Deploy twice. Foreground the installed app: the update notice appears only while nothing is playing, and Reload keeps the queue.
