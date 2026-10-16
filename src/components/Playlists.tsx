import { useMemo, useState } from "react";
import { formatTotal, plural } from "../lib/format";
import { addToPlaylist, createPlaylist, deletePlaylist, renamePlaylist, savePlaylist, totalSeconds, useLikedTracks, usePlaylists, useTrackMap, useTracks } from "../lib/library";
import { playTracks } from "../lib/player";
import { matchesSearch, searchWords, useListPlayback } from "../lib/useListPlayback";
import type { Playlist, Track } from "../lib/types";
import { Dialog } from "./Dialog";
import { ArrowLeftIcon, CheckIcon, CloseIcon, PencilIcon, PlayIcon, PlusIcon, ShuffleIcon, TrashIcon } from "./icons";
import { SearchField } from "./SearchField";
import { SongList } from "./SongList";
import { Confirm } from "./SongMenu";
import { Button, CoverArt, TextField } from "./ui";

function playlistTracks(p: Playlist, byId: Map<string, Track>): Track[] {
  return p.trackIds.map((id) => byId.get(id)).filter((t): t is Track => t !== undefined);
}

function PlaylistTile({ name, tracks, onOpen }: { name: string; tracks: Track[]; onOpen: () => void }) {
  return (
    <li className="xh-show">
      <button className="show-open" onClick={onOpen}>
        <CoverArt artId={tracks.find((t) => t.artId)?.artId ?? null} title={name} size="fluid" />
        <div className="name">{name}</div>
        <div className="note">
          {plural(tracks.length, "song")}
          {tracks.length > 0 && ` · ${formatTotal(totalSeconds(tracks))}`}
        </div>
      </button>
    </li>
  );
}

export function Playlists({ onOpen, onOpenLiked }: { onOpen: (id: string) => void; onOpenLiked: () => void }) {
  const playlists = usePlaylists();
  const byId = useTrackMap();
  const liked = useLikedTracks();
  const [name, setName] = useState("");

  return (
    <section aria-labelledby="playlists-title">
      <div className="page-head">
        <h1 id="playlists-title" className="display-lg" tabIndex={-1}>
          Playlists
        </h1>
        {playlists.length > 0 && <span className="count">{plural(playlists.length, "playlist")}</span>}
      </div>
      <form
        className="inline-form new-playlist"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const p = await createPlaylist(name);
          if (!p) return;
          setName("");
          onOpen(p.id);
        }}
      >
        <TextField
          label="New playlist"
          placeholder="Playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          suffix={
            <Button type="submit" icon={<PlusIcon />} disabled={!name.trim()}>
              Create
            </Button>
          }
        />
      </form>
      <ul className="xh-shows tiles">
        <PlaylistTile name="Liked songs" tracks={liked} onOpen={onOpenLiked} />
        {playlists.map((p) => (
          <PlaylistTile key={p.id} name={p.name} tracks={playlistTracks(p, byId)} onOpen={() => onOpen(p.id)} />
        ))}
      </ul>
      {playlists.length === 0 && (
        <p className="lead muted">No playlists yet. Make one here, or add a song to a new playlist from its menu.</p>
      )}
    </section>
  );
}

export function LikedPage({ onBack, onMore }: { onBack: () => void; onMore: (track: Track) => void }) {
  const tracks = useLikedTracks();
  const { currentIndex, playing, onPlay } = useListPlayback(tracks);
  const ids = tracks.map((t) => t.id);

  return (
    <section aria-labelledby="liked-title">
      <Button variant="ghost" className="back" icon={<ArrowLeftIcon />} onClick={onBack}>
        Playlists
      </Button>
      <div className="show-head">
        <CoverArt artId={tracks.find((t) => t.artId)?.artId ?? null} title="Liked songs" size={120} />
        <div>
          <h1 id="liked-title" className="display-lg" tabIndex={-1}>
            Liked songs
          </h1>
          <div className="count">
            {plural(tracks.length, "song")}
            {tracks.length > 0 && ` · ${formatTotal(totalSeconds(tracks))}`}
          </div>
          <div className="head-actions">
            <Button icon={<PlayIcon />} disabled={!ids.length} onClick={() => playTracks(ids, 0, { shuffle: false })}>
              Play
            </Button>
            <Button variant="secondary" icon={<ShuffleIcon />} disabled={!ids.length} onClick={() => playTracks(ids, -1, { shuffle: true })}>
              Shuffle
            </Button>
          </div>
        </div>
      </div>
      {tracks.length === 0 ? (
        <p className="list-empty muted">Songs you like show up here. Like one from its menu or the player, or press L while it plays.</p>
      ) : (
        <SongList
          label="Liked songs"
          tracks={tracks}
          currentIndex={currentIndex}
          playing={playing}
          onPlay={onPlay}
          onMore={(i) => onMore(tracks[i])}
        />
      )}
    </section>
  );
}

export function PlaylistPage({
  id,
  onBack,
  onMore,
  onToast,
}: {
  id: string;
  onBack: () => void;
  onMore: (track: Track, index: number) => void;
  onToast: (message: string, undo?: () => void) => void;
}) {
  const playlist = usePlaylists().find((p) => p.id === id);
  const byId = useTrackMap();
  const tracks = useMemo(() => (playlist ? playlistTracks(playlist, byId) : []), [playlist, byId]);
  const { currentIndex, playing, onPlay } = useListPlayback(tracks);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!playlist) {
    return (
      <section>
        <Button variant="ghost" className="back" icon={<ArrowLeftIcon />} onClick={onBack}>
          Playlists
        </Button>
        <p className="lead muted">This playlist was deleted.</p>
      </section>
    );
  }
  const ids = tracks.map((t) => t.id);

  return (
    <section aria-labelledby="playlist-title">
      <Button variant="ghost" className="back" icon={<ArrowLeftIcon />} onClick={onBack}>
        Playlists
      </Button>
      <div className="show-head">
        <CoverArt artId={tracks.find((t) => t.artId)?.artId ?? null} title={playlist.name} size={120} />
        <div>
          {renaming === null ? (
            <h1 id="playlist-title" className="display-lg" tabIndex={-1}>
              {playlist.name}
            </h1>
          ) : (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void renamePlaylist(playlist.id, renaming);
                setRenaming(null);
              }}
            >
              <TextField
                label="Playlist name"
                autoFocus
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                suffix={
                  <Button type="submit" variant="secondary" icon={<CheckIcon />}>
                    Save
                  </Button>
                }
              />
            </form>
          )}
          <div className="count">
            {plural(tracks.length, "song")}
            {tracks.length > 0 && ` · ${formatTotal(totalSeconds(tracks))}`}
          </div>
          <div className="head-actions">
            <Button icon={<PlayIcon />} disabled={!ids.length} onClick={() => playTracks(ids, 0, { shuffle: false })}>
              Play
            </Button>
            <Button variant="secondary" icon={<ShuffleIcon />} disabled={!ids.length} onClick={() => playTracks(ids, -1, { shuffle: true })}>
              Shuffle
            </Button>
            <Button variant="secondary" icon={<PlusIcon />} onClick={() => setAdding(true)}>
              Add songs
            </Button>
            <Button variant="ghost" icon={<PencilIcon />} onClick={() => setRenaming(playlist.name)}>
              Rename
            </Button>
            <Button variant="ghost" icon={<TrashIcon />} onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        </div>
      </div>
      {tracks.length === 0 ? (
        <p className="list-empty muted">This playlist is empty. Use Add songs, or Add to playlist from any song's menu.</p>
      ) : (
        <SongList
          label={`${playlist.name} songs`}
          tracks={tracks}
          currentIndex={currentIndex}
          playing={playing}
          onPlay={onPlay}
          onMore={(i) => onMore(tracks[i], playlist.trackIds.indexOf(tracks[i].id, i))}
        />
      )}
      {adding && <AddSongs playlist={playlist} onClose={() => setAdding(false)} />}
      {confirming && (
        <Dialog label="Delete playlist" onClose={() => setConfirming(false)}>
          <div className="dialog-head">
            <h2 className="h3">Delete {playlist.name}?</h2>
          </div>
          <Confirm
            message="The songs stay in your library."
            action="Delete playlist"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              const before = playlist;
              void deletePlaylist(playlist.id);
              onBack();
              onToast(`Deleted ${playlist.name}.`, () => void savePlaylist(before));
            }}
          />
        </Dialog>
      )}
    </section>
  );
}

function AddSongs({ playlist, onClose }: { playlist: Playlist; onClose: () => void }) {
  const tracks = useTracks();
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const words = searchWords(query);
  const shown = tracks.filter((t) => matchesSearch(t, words)).slice(0, 200);

  const latest = usePlaylists().find((p) => p.id === playlist.id) ?? playlist;

  function add(t: Track) {
    void addToPlaylist(playlist.id, [t.id]);
    setAdded(new Set(added).add(t.id));
  }

  return (
    <Dialog label={`Add songs to ${playlist.name}`} className="add-songs" onClose={onClose}>
      <div className="dialog-head">
        <h2 className="h3">Add to {playlist.name}</h2>
        <button className="sheet-close" aria-label="Done" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <SearchField label="Search songs" value={query} onChange={setQuery} />
      <ul className="pick-list">
        {shown.map((t) => {
          const inList = added.has(t.id) || latest.trackIds.includes(t.id);
          return (
            <li key={t.id}>
              <span className="song-text">
                <span className="ttl">{t.title}</span>
                <span className="sub">{t.artist}</span>
              </span>
              {inList ? (
                <span className="menu-note">Added</span>
              ) : (
                <Button variant="secondary" small icon={<PlusIcon />} aria-label={`Add ${t.title}`} onClick={() => add(t)} />
              )}
            </li>
          );
        })}
      </ul>
      {tracks.length > shown.length && shown.length === 200 && <p className="xh-help">Showing the first 200. Search to narrow it down.</p>}
    </Dialog>
  );
}
