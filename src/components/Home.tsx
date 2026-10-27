import { useMemo } from "react";
import { albumNote } from "../lib/format";
import { useFavouriteAlbums, useFavouritePlaylists, useTrackMap } from "../lib/library";
import { playlistTracks } from "../lib/playlists";
import { AlbumTile } from "./Albums";
import { PlaylistTile } from "./Playlists";
import { Button } from "./ui";

export function Home({
  onOpenAlbum,
  onOpenPlaylist,
  onBrowse,
}: {
  onOpenAlbum: (key: string) => void;
  onOpenPlaylist: (id: string) => void;
  onBrowse: () => void;
}) {
  const albums = useFavouriteAlbums();
  const playlists = useFavouritePlaylists();
  const byId = useTrackMap();
  const playlistSongs = useMemo(() => new Map(playlists.map((p) => [p.id, playlistTracks(p, byId)])), [playlists, byId]);

  return (
    <section aria-labelledby="home-title">
      <div className="page-head">
        <h1 id="home-title" className="display-lg" tabIndex={-1}>
          Home
        </h1>
      </div>
      {albums.length === 0 && playlists.length === 0 && (
        <div className="empty">
          <h2 className="h3">No favourites yet</h2>
          <p className="muted">Tap the heart on an album or playlist to keep it here.</p>
          <div className="head-actions">
            <Button onClick={onBrowse}>Browse albums</Button>
          </div>
        </div>
      )}
      {playlists.length > 0 && (
        <>
          <h2 className="h3 section-title">Playlists</h2>
          <ul className="xh-shows tiles">
            {playlists.map((p) => (
              <PlaylistTile key={p.id} name={p.name} tracks={playlistSongs.get(p.id)!} onOpen={() => onOpenPlaylist(p.id)} />
            ))}
          </ul>
        </>
      )}
      {albums.length > 0 && (
        <>
          <h2 className="h3 section-title">Albums</h2>
          <ul className="xh-shows tiles">
            {albums.map((a) => (
              <AlbumTile key={a.key} album={a} note={albumNote(a)} onOpen={onOpenAlbum} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
