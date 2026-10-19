import { useEffect, useMemo, useState } from "react";
import { plural } from "../lib/format";
import { useAlbums, useArtists, usePlays, useRemovedSongs, useTrackMap, useTracks } from "../lib/library";
import { playTracks } from "../lib/player";
import { groupPlays, isPeriod, mostPlayed, mostPlayedEver, periodStart, PERIODS, type Period, type Ranked } from "../lib/review";
import type { Track } from "../lib/types";
import { useListPlayback } from "../lib/useListPlayback";
import { AlbumTile } from "./Albums";
import { ArtistTile } from "./Artists";
import { PlayIcon, ShuffleIcon } from "./icons";
import { SongList } from "./SongList";
import { Button } from "./ui";

const PERIOD_KEY = "tunenook.reviewPeriod";
const TOP_SONGS = 25;
const TOP_GROUPS = 6;

const sum = (list: Ranked[]) => list.reduce((n, r) => n + r.plays, 0);

function savedPeriod(): Period {
  try {
    const saved = localStorage.getItem(PERIOD_KEY);
    return isPeriod(saved) ? saved : "30d";
  } catch {
    return "30d";
  }
}

export function Review({
  onMore,
  onOpenArtist,
  onOpenAlbum,
}: {
  onMore: (track: Track) => void;
  onOpenArtist: (key: string) => void;
  onOpenAlbum: (key: string) => void;
}) {
  const plays = usePlays();
  const tracks = useTracks();
  const byId = useTrackMap();
  const removedSongs = useRemovedSongs();
  const artists = useArtists();
  const albums = useAlbums();
  const [period, setPeriod] = useState(savedPeriod);
  // Fixed while you're looking, so songs don't drop out mid-visit; moves on when the app comes back to the front.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const heading = PERIODS.find((p) => p.value === period)!.heading;

  const ranked = useMemo(
    () => (period === "all" ? mostPlayedEver(tracks, plays) : mostPlayed(plays, periodStart(period, now))),
    [period, plays, tracks, now],
  );

  // Removed songs can't be played, so they count toward the totals but aren't listed.
  const songs = useMemo(() => {
    const inLibrary = ranked.filter((r) => byId.has(r.key));
    const shown = inLibrary.slice(0, TOP_SONGS);
    const total = sum(ranked);
    return {
      top: shown.map((r) => byId.get(r.key)!),
      counts: shown.map((r) => r.plays),
      listed: inLibrary.length,
      total,
      removed: total - sum(inLibrary),
    };
  }, [ranked, byId]);

  // Only artists and albums still in the library get a tile, since a tile opens their page.
  const { topArtists, topAlbums } = useMemo(() => {
    const grouped = groupPlays(ranked, (id) => byId.get(id) ?? removedSongs.get(id));
    const artistByKey = new Map(artists.map((a) => [a.key, a]));
    const albumByKey = new Map(albums.map((a) => [a.key, a]));
    return {
      topArtists: grouped.artists.flatMap((r) => {
        const artist = artistByKey.get(r.key);
        return artist ? [{ artist, plays: r.plays }] : [];
      }).slice(0, TOP_GROUPS),
      topAlbums: grouped.albums.flatMap((r) => {
        const album = albumByKey.get(r.key);
        return album ? [{ album, plays: r.plays }] : [];
      }).slice(0, TOP_GROUPS),
    };
  }, [ranked, byId, removedSongs, artists, albums]);

  const { currentIndex, playing, onPlay } = useListPlayback(songs.top);
  const ids = songs.top.map((t) => t.id);
  const notes = [
    songs.listed > TOP_SONGS && `Showing the top ${TOP_SONGS} of ${plural(songs.listed, "song")}.`,
    songs.removed > 0 && `${plural(songs.removed, "play")} of songs you've removed ${songs.removed === 1 ? "isn't" : "aren't"} listed.`,
  ].filter(Boolean);

  function choose(next: Period) {
    setPeriod(next);
    try {
      localStorage.setItem(PERIOD_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
  }

  return (
    <section aria-labelledby="review-title">
      <div className="page-head">
        <h1 id="review-title" className="display-lg" tabIndex={-1}>
          Review
        </h1>
      </div>
      <div className="periods" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.value} className="filter" aria-pressed={period === p.value} onClick={() => choose(p.value)}>
            {p.label}
          </button>
        ))}
      </div>
      {songs.total === 0 ? (
        <div className="empty">
          <h2 className="h3">{period === "all" ? "Nothing played yet" : `Nothing played in the ${heading.toLowerCase()}`}</h2>
          <p className="muted">Songs you play show up here. A play counts after 30 seconds, or after half of a shorter song.</p>
        </div>
      ) : (
        <>
          <p className="review-summary muted">
            {plural(songs.total, "play")} of {plural(ranked.length, "song")}.
          </p>
          <div className="head-actions">
            <Button small icon={<PlayIcon />} disabled={!ids.length} onClick={() => playTracks(ids, 0, { shuffle: false })}>
              Play
            </Button>
            <Button small variant="secondary" icon={<ShuffleIcon />} disabled={!ids.length} onClick={() => playTracks(ids, -1, { shuffle: true })}>
              Shuffle
            </Button>
          </div>
          <h2 className="h3 section-title">Top songs</h2>
          {songs.top.length > 0 ? (
            <SongList
              label={`Top songs, ${heading.toLowerCase()}`}
              tracks={songs.top}
              currentIndex={currentIndex}
              playing={playing}
              onPlay={onPlay}
              onMore={(i) => onMore(songs.top[i])}
              detail={(i) => plural(songs.counts[i], "play")}
            />
          ) : (
            <p className="list-empty muted">The songs you played have since been removed.</p>
          )}
          {notes.length > 0 && <p className="list-empty muted">{notes.join(" ")}</p>}
          {topArtists.length > 0 && (
            <>
              <h2 className="h3 section-title">Top artists</h2>
              <ul className="xh-shows tiles">
                {topArtists.map(({ artist, plays }) => (
                  <ArtistTile key={artist.key} artist={artist} note={plural(plays, "play")} onOpen={onOpenArtist} />
                ))}
              </ul>
            </>
          )}
          {topAlbums.length > 0 && (
            <>
              <h2 className="h3 section-title">Top albums</h2>
              <ul className="xh-shows tiles">
                {topAlbums.map(({ album, plays }) => (
                  <AlbumTile key={album.key} album={album} note={plural(plays, "play")} onOpen={onOpenAlbum} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
