import { formatClock } from "../lib/format";
import type { Track } from "../lib/types";
import { MoreIcon, PauseIcon, PlayIcon } from "./icons";
import { CoverArt } from "./ui";

interface Props {
  tracks: Track[];
  // Which row is the song that's loaded. Playlists and the queue can hold a song twice, so it's an index.
  currentIndex: number | null;
  playing: boolean;
  numbered?: boolean;
  showAlbum?: boolean;
  onPlay: (index: number) => void;
  onMore: (index: number) => void;
  label: string;
}

export function SongList({ tracks, currentIndex, playing, numbered, showAlbum = true, onPlay, onMore, label }: Props) {
  return (
    <ul className="songs" aria-label={label}>
      {tracks.map((t, i) => {
        const current = i === currentIndex;
        const sub = showAlbum && t.album ? `${t.artist} · ${t.album}` : t.artist;
        return (
          <li key={`${t.id}:${i}`} className={`song${current ? " is-current" : ""}`}>
            <button
              className="song-main"
              aria-label={`${current && playing ? "Pause" : "Play"} ${t.title} by ${t.artist}`}
              aria-current={current ? "true" : undefined}
              onClick={() => onPlay(i)}
            >
              {numbered ? (
                <span className="song-no" aria-hidden="true">
                  {current ? playing ? <PauseIcon /> : <PlayIcon /> : (t.trackNo ?? "·")}
                </span>
              ) : (
                <span className="song-art">
                  <CoverArt artId={t.artId} title={t.album || t.title} size={40} />
                  {current && <span className="song-state">{playing ? <PauseIcon /> : <PlayIcon />}</span>}
                </span>
              )}
              <span className="song-text">
                <span className="ttl">{t.title}</span>
                <span className="sub">{sub}</span>
              </span>
              <span className="song-dur">{t.duration ? formatClock(t.duration) : ""}</span>
            </button>
            <button className="xh-icon-btn song-more" aria-label={`More for ${t.title}`} onClick={() => onMore(i)}>
              <MoreIcon />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
