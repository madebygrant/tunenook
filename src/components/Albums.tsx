import { useState } from "react";
import { formatTotal, plural } from "../lib/format";
import { totalSeconds, useAlbums } from "../lib/library";
import { playTracks } from "../lib/player";
import { matchesSearch, searchWords, useListPlayback } from "../lib/useListPlayback";
import type { Album, Track } from "../lib/types";
import { ArrowLeftIcon, MoreIcon, PlayIcon, ShuffleIcon } from "./icons";
import { SearchField } from "./SearchField";
import { CollectionMenu } from "./SongMenu";
import { SongList } from "./SongList";
import { Button, CoverArt } from "./ui";

export function Albums({ onOpen, onAdd }: { onOpen: (key: string) => void; onAdd: () => void }) {
  const albums = useAlbums();
  const [query, setQuery] = useState("");
  const words = searchWords(query);
  const shown = albums.filter((a) => words.length === 0 || a.tracks.some((t) => matchesSearch(t, words)));

  return (
    <section aria-labelledby="albums-title">
      <div className="page-head">
        <h1 id="albums-title" className="display-lg" tabIndex={-1}>
          Albums
        </h1>
        {albums.length > 0 && <span className="count">{plural(albums.length, "album")}</span>}
      </div>
      {albums.length === 0 ? (
        <div className="empty">
          <h2 className="h3">No albums yet</h2>
          <p className="muted">Albums come from the tags in your files.</p>
          <div className="head-actions">
            <Button onClick={onAdd}>Add music</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="list-tools">
            <SearchField label="Search albums and artists" value={query} onChange={setQuery} />
          </div>
          <ul className="xh-shows tiles">
            {shown.map((a) => (
              <AlbumTile key={a.key} album={a} note={a.year ? `${a.artist} · ${a.year}` : a.artist} onOpen={onOpen} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function AlbumTile({ album, note, onOpen }: { album: Album; note: string; onOpen: (key: string) => void }) {
  return (
    <li className="xh-show">
      <button className="show-open" onClick={() => onOpen(album.key)}>
        <CoverArt artId={album.artId} title={album.title} size="fluid" />
        <div className="name">{album.title}</div>
        <div className="note">{note}</div>
      </button>
    </li>
  );
}

export function AlbumPage({
  albumKey,
  backLabel,
  onBack,
  onMore,
  onToast,
}: {
  albumKey: string;
  backLabel: string;
  onBack: () => void;
  onMore: (track: Track) => void;
  onToast: (message: string) => void;
}) {
  const album = useAlbums().find((a) => a.key === albumKey);
  const tracks = album?.tracks ?? [];
  const { currentIndex, playing, onPlay } = useListPlayback(tracks);
  const [menuOpen, setMenuOpen] = useState(false);
  const ids = tracks.map((t) => t.id);

  if (!album) {
    return (
      <section>
        <Button variant="ghost" className="back" icon={<ArrowLeftIcon />} onClick={onBack}>
          {backLabel}
        </Button>
        <p className="lead muted">This album is no longer in your library.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="album-title">
      <Button variant="ghost" className="back" icon={<ArrowLeftIcon />} onClick={onBack}>
        {backLabel}
      </Button>
      <div className="show-head">
        <CoverArt artId={album.artId} title={album.title} size={120} />
        <div>
          <h1 id="album-title" className="display-lg" tabIndex={-1}>
            {album.title}
          </h1>
          <div className="author">
            {album.artist}
            {album.year ? ` · ${album.year}` : ""}
          </div>
          <div className="count">
            {plural(tracks.length, "song")} · {formatTotal(totalSeconds(tracks))}
          </div>
          <div className="head-actions">
            <Button icon={<PlayIcon />} onClick={() => playTracks(ids, 0, { shuffle: false })}>
              Play
            </Button>
            <Button variant="secondary" icon={<ShuffleIcon />} onClick={() => playTracks(ids, -1, { shuffle: true })}>
              Shuffle
            </Button>
            <Button variant="ghost" icon={<MoreIcon />} aria-label={`More for ${album.title}`} onClick={() => setMenuOpen(true)} />
          </div>
        </div>
      </div>
      {menuOpen && (
        <CollectionMenu
          title={album.title}
          subtitle={album.artist}
          ids={ids}
          onClose={() => setMenuOpen(false)}
          onToast={onToast}
        />
      )}
      <SongList
        label={`${album.title} songs`}
        tracks={tracks}
        numbered
        showAlbum={false}
        currentIndex={currentIndex}
        playing={playing}
        onPlay={onPlay}
        onMore={(i) => onMore(tracks[i])}
      />
    </section>
  );
}
