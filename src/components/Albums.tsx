import { useDeferredValue, useMemo, useState } from "react";
import { formatTotal, plural } from "../lib/format";
import { findAlbumArt, needsArt, useArtLookup, type LookupResult } from "../lib/artLookup";
import { downscale } from "../lib/importer";
import { isListedAlbum, isUntaggedGroup, MIN_ALBUM_TRACKS, setAlbumArt, totalSeconds, useAlbums } from "../lib/library";
import { playTracks } from "../lib/player";
import { matchesSearch, searchWords, useListPlayback } from "../lib/useListPlayback";
import { useSelection } from "../lib/useSelection";
import type { Album, Track } from "../lib/types";
import { ArrowLeftIcon, MoreIcon, PlayIcon, ShuffleIcon } from "./icons";
import { SearchField } from "./SearchField";
import { SelectableActions, SelectButton } from "./Selection";
import { AlbumDetails } from "./EditDetails";
import { CollectionMenu, MenuSheet } from "./SongMenu";
import { SongList } from "./SongList";
import { Button, CoverArt } from "./ui";

export function Albums({ onOpen, onAdd }: { onOpen: (key: string) => void; onAdd: () => void }) {
  const albums = useAlbums();
  const visible = useMemo(() => albums.filter(isListedAlbum), [albums]);
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query);
  const shown = useMemo(() => {
    const words = searchWords(search);
    return words.length === 0 ? visible : visible.filter((a) => a.tracks.some((t) => matchesSearch(t, words)));
  }, [visible, search]);

  return (
    <section aria-labelledby="albums-title">
      <div className="page-head">
        <h1 id="albums-title" className="display-lg" tabIndex={-1}>
          Albums
        </h1>
        {visible.length > 0 && <span className="count">{plural(visible.length, "album")}</span>}
      </div>
      {albums.length === 0 ? (
        <div className="empty">
          <h2 className="h3">No albums yet</h2>
          <p className="muted">Albums come from the tags in your files.</p>
          <div className="head-actions">
            <Button onClick={onAdd}>Add music</Button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="list-empty muted">No albums with more than {MIN_ALBUM_TRACKS} songs yet.</p>
      ) : (
        <>
          <div className="list-tools">
            <SearchField label="Search albums and artists" value={query} onChange={setQuery} />
          </div>
          {shown.length === 0 ? (
            <p className="list-empty muted">No albums match “{search}”.</p>
          ) : (
            <ul className="xh-shows tiles">
              {shown.map((a) => (
                <AlbumTile key={a.key} album={a} note={a.year ? `${a.artist} · ${a.year}` : a.artist} onOpen={onOpen} />
              ))}
            </ul>
          )}
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
  onRenamed,
  onToast,
}: {
  albumKey: string;
  backLabel: string;
  onBack: () => void;
  onMore: (track: Track) => void;
  onRenamed: (key: string) => void;
  onToast: (message: string) => void;
}) {
  const found = useAlbums().find((a) => a.key === albumKey);
  // Held through a rename, so the page doesn't flash as missing before it moves to the album's new key.
  const [renaming, setRenaming] = useState<Album | null>(null);
  const album = found ?? renaming;
  const tracks = album?.tracks ?? [];
  const { currentIndex, playing, onPlay } = useListPlayback(tracks);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const lookupOn = useArtLookup();
  const selection = useSelection(tracks);
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

  // Songs with no album are grouped here by artist, but each keeps its own cover and stays off any album.
  const untagged = isUntaggedGroup(album);

  async function findArtwork(target: Album) {
    onToast(`Looking up ${target.title} on MusicBrainz…`);
    let result: LookupResult;
    try {
      result = await findAlbumArt(target);
    } catch (e) {
      return onToast(e instanceof Error ? e.message : "Couldn't look up the artwork.");
    }
    // A failed save has already been reported by the library.
    if (result === "found") onToast(`Found artwork for ${target.title}.`);
    else if (result === "none") onToast(`MusicBrainz has no artwork for ${target.title}.`);
    else if (result === "has-art") onToast(`${target.title} got artwork while looking, so it was kept.`);
  }

  async function setArtwork(file: File) {
    const blob = await downscale(file);
    if (!blob) return onToast("Couldn't read that image. Try a JPEG or PNG.");
    if (await setAlbumArt(albumKey, blob)) onToast(`Set the artwork for ${album!.title}.`);
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
          <SelectableActions selection={selection} tracks={tracks} removal={{ kind: "library" }} onToast={onToast}>
            <Button small icon={<PlayIcon />} onClick={() => playTracks(ids, 0, { shuffle: false })}>
              Play
            </Button>
            <Button small variant="secondary" icon={<ShuffleIcon />} onClick={() => playTracks(ids, -1, { shuffle: true })}>
              Shuffle
            </Button>
            <SelectButton small selection={selection} />
            <Button small variant="ghost" icon={<MoreIcon />} aria-label={`More for ${album.title}`} onClick={() => setMenuOpen(true)} />
          </SelectableActions>
        </div>
      </div>
      {menuOpen && (
        <CollectionMenu
          title={album.title}
          subtitle={album.artist}
          ids={ids}
          extraItems={untagged ? [] : [
            {
              label: "Edit album details…",
              run: () => {
                setMenuOpen(false);
                setEditing(true);
              },
            },
            {
              label: "Set artwork…",
              run: () => setMenuOpen(false),
              pick: { accept: "image/*", onPick: (file) => void setArtwork(file) },
            },
            ...(lookupOn && needsArt(album)
              ? [
                  {
                    // Says where it goes, since it's the one action that sends anything off the device.
                    label: "Find artwork on MusicBrainz",
                    run: () => {
                      setMenuOpen(false);
                      void findArtwork(album);
                    },
                  },
                ]
              : []),
          ]}
          onClose={() => setMenuOpen(false)}
          onToast={onToast}
        />
      )}
      {editing && (
        <MenuSheet label={`Edit ${album.title}`} title={album.title} subtitle={album.artist} onClose={() => setEditing(false)}>
          <AlbumDetails
            album={album}
            onSaving={(saving) => setRenaming(saving ? album : null)}
            onSaved={(message, key) => {
              onToast(message);
              if (key !== albumKey) onRenamed(key);
              else {
                setEditing(false);
                setRenaming(null);
              }
            }}
            onCancel={() => setEditing(false)}
          />
        </MenuSheet>
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
        selection={selection}
      />
    </section>
  );
}
