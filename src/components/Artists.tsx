import { useState } from "react";
import { formatTotal, plural } from "../lib/format";
import { totalSeconds, useArtists } from "../lib/library";
import { playTracks } from "../lib/player";
import { searchWords, useListPlayback } from "../lib/useListPlayback";
import { useSelection } from "../lib/useSelection";
import type { Album, Track } from "../lib/types";
import { ArrowLeftIcon, PlayIcon, ShuffleIcon } from "./icons";
import { AlbumTile } from "./Albums";
import { SearchField } from "./SearchField";
import { SelectButton, SelectionBar } from "./Selection";
import { SongList } from "./SongList";
import { Button, CoverArt } from "./ui";

function counts(albums: number, songs: number): string {
  return albums ? `${plural(albums, "album")} · ${plural(songs, "song")}` : plural(songs, "song");
}

export function Artists({ onOpen, onAdd }: { onOpen: (key: string) => void; onAdd: () => void }) {
  const artists = useArtists();
  const [query, setQuery] = useState("");
  const words = searchWords(query);
  const shown = artists.filter((a) => words.every((w) => a.key.includes(w)));

  return (
    <section aria-labelledby="artists-title">
      <div className="page-head">
        <h1 id="artists-title" className="display-lg" tabIndex={-1}>
          Artists
        </h1>
        {artists.length > 0 && <span className="count">{plural(artists.length, "artist")}</span>}
      </div>
      {artists.length === 0 ? (
        <div className="empty">
          <h2 className="h3">No artists yet</h2>
          <p className="muted">Artists come from the tags in your files.</p>
          <div className="head-actions">
            <Button onClick={onAdd}>Add music</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="list-tools">
            <SearchField label="Search artists" value={query} onChange={setQuery} />
          </div>
          {shown.length === 0 ? (
            <p className="list-empty muted">No artists match “{query}”.</p>
          ) : (
            <ul className="xh-shows tiles">
              {shown.map((a) => (
                <li key={a.key} className="xh-show">
                  <button className="show-open" onClick={() => onOpen(a.key)}>
                    <CoverArt artId={a.artId} title={a.name} size="fluid" />
                    <div className="name">{a.name}</div>
                    <div className="note">{counts(a.albums.length, a.tracks.length)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export function ArtistPage({
  artistKey,
  onBack,
  onOpenAlbum,
  onMore,
  onToast,
}: {
  artistKey: string;
  onBack: () => void;
  onOpenAlbum: (key: string) => void;
  onMore: (track: Track) => void;
  onToast: (message: string) => void;
}) {
  const artist = useArtists().find((a) => a.key === artistKey);
  const songs = artist?.songs ?? [];
  const { currentIndex, playing, onPlay } = useListPlayback(songs);
  const selection = useSelection(songs);

  if (!artist) {
    return (
      <section>
        <Button variant="ghost" className="back" icon={<ArrowLeftIcon />} onClick={onBack}>
          Artists
        </Button>
        <p className="lead muted">This artist is no longer in your library.</p>
      </section>
    );
  }
  const ids = artist.tracks.map((t) => t.id);

  return (
    <section aria-labelledby="artist-title">
      <Button variant="ghost" className="back" icon={<ArrowLeftIcon />} onClick={onBack}>
        Artists
      </Button>
      <div className="show-head">
        <CoverArt artId={artist.artId} title={artist.name} size={120} />
        <div>
          <h1 id="artist-title" className="display-lg" tabIndex={-1}>
            {artist.name}
          </h1>
          <div className="count">
            {counts(artist.albums.length, artist.tracks.length)} · {formatTotal(totalSeconds(artist.tracks))}
          </div>
          <div className="head-actions">
            <Button small icon={<PlayIcon />} onClick={() => playTracks(ids, 0, { shuffle: false })}>
              Play
            </Button>
            <Button small variant="secondary" icon={<ShuffleIcon />} onClick={() => playTracks(ids, -1, { shuffle: true })}>
              Shuffle
            </Button>
          </div>
        </div>
      </div>
      {artist.albums.length > 0 && (
        <>
          <h2 className="h3 section-title">Albums</h2>
          <AlbumTiles albums={artist.albums} onOpen={onOpenAlbum} />
        </>
      )}
      {artist.appearsOn.length > 0 && (
        <>
          <h2 className="h3 section-title">Appears on</h2>
          <AlbumTiles albums={artist.appearsOn} onOpen={onOpenAlbum} />
        </>
      )}
      {songs.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="h3 section-title">{artist.albums.length ? "Other songs" : "Songs"}</h2>
            {!selection.active && <SelectButton selection={selection} small />}
          </div>
          {selection.active && <SelectionBar selection={selection} tracks={songs} removal={{ kind: "library" }} onToast={onToast} />}
          <SongList
            label={`${artist.name} songs`}
            tracks={songs}
            currentIndex={currentIndex}
            playing={playing}
            onPlay={onPlay}
            onMore={(i) => onMore(songs[i])}
            selection={selection}
          />
        </>
      )}
    </section>
  );
}

function AlbumTiles({ albums, onOpen }: { albums: Album[]; onOpen: (key: string) => void }) {
  return (
    <ul className="xh-shows tiles">
      {albums.map((a) => (
        <AlbumTile
          key={a.key}
          album={a}
          note={a.year ? `${a.year} · ${plural(a.tracks.length, "song")}` : plural(a.tracks.length, "song")}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}
