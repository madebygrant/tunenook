import { useState, type ReactNode } from "react";
import { canLinkFolders, copyIntoLibrary, NeedsAccessError, requestAccess } from "../lib/folders";
import { addToPlaylist, artistPageFor, createPlaylist, toggleLike, getPlaylists, removeTracksSafely, savePlaylist, usePlaylists } from "../lib/library";
import { addToQueue, playNext, removeFromQueue } from "../lib/player";
import { moved, withoutIndex } from "../lib/playlists";
import { albumKey } from "../lib/tags";
import type { Playlist, Track } from "../lib/types";
import { Dialog } from "./Dialog";
import { CloseIcon, PlusIcon } from "./icons";
import { Button, TextField } from "./ui";
import type { View } from "./Sidebar";

export type MenuContext =
  | { kind: "library" }
  | { kind: "playlist"; playlistId: string; index: number }
  | { kind: "queue"; pos: number };

export interface MenuTarget {
  track: Track;
  context: MenuContext;
}

interface Props {
  target: MenuTarget;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onToast: (message: string, undo?: () => void) => void;
}

export function SongMenu({ target, onClose, onNavigate, onToast }: Props) {
  const { track, context } = target;
  const [step, setStep] = useState<"actions" | "pick" | "confirm">("actions");
  const [error, setError] = useState<string | null>(null);
  const playlist = context.kind === "playlist" ? getPlaylists().find((p) => p.id === context.playlistId) : undefined;

  function run(action: () => void, message?: string) {
    action();
    onClose();
    if (message) onToast(message);
  }

  function editPlaylist(change: (p: Playlist) => Playlist, message?: string) {
    if (!playlist) return;
    const before = playlist;
    void savePlaylist(change(playlist));
    onClose();
    if (message) onToast(message, () => void savePlaylist(before));
  }

  async function copy() {
    setError(null);
    try {
      await copyIntoLibrary([track], () => {});
      onClose();
      onToast(`Copied ${track.title} into TuneNook.`);
    } catch (e) {
      if (e instanceof NeedsAccessError && (await requestAccess(e.folderId))) return copy();
      setError("Couldn't copy this song. Check the folder is still there and try again.");
    }
  }

  const items: { label: string; run: () => void; danger?: boolean }[] = [
    { label: "Play next", run: () => run(() => playNext([track.id]), `${track.title} plays next.`) },
    { label: "Add to queue", run: () => run(() => addToQueue([track.id]), `Added ${track.title} to the queue.`) },
    { label: "Add to playlist…", run: () => setStep("pick") },
    {
      label: track.likedAt === undefined ? "Like" : "Unlike",
      run: () => run(() => void toggleLike(track.id)),
    },
  ];
  if (track.album) {
    items.push({
      label: "Go to album",
      run: () => run(() => onNavigate({ kind: "album", key: albumKey(track.albumArtist || track.artist, track.album) })),
    });
  }
  const artist = artistPageFor(track);
  if (artist) items.push({ label: "Go to artist", run: () => run(() => onNavigate({ kind: "artist", key: artist })) });
  if (context.kind === "playlist" && playlist) {
    const { index } = context;
    const now = Date.now();
    if (index > 0) items.push({ label: "Move up", run: () => editPlaylist((p) => moved(p, index, index - 1, now)) });
    if (index < playlist.trackIds.length - 1) {
      items.push({ label: "Move down", run: () => editPlaylist((p) => moved(p, index, index + 1, now)) });
    }
    items.push({
      label: "Remove from playlist",
      danger: true,
      run: () => editPlaylist((p) => withoutIndex(p, index, now), `Removed ${track.title} from ${playlist.name}.`),
    });
  }
  if (context.kind === "queue") {
    items.push({ label: "Remove from queue", danger: true, run: () => run(() => removeFromQueue(context.pos)) });
  }
  if (canLinkFolders && track.source.kind === "linked") items.push({ label: "Copy into TuneNook", run: () => void copy() });
  if (context.kind === "library") items.push({ label: "Remove from library…", danger: true, run: () => setStep("confirm") });

  return (
    <Dialog label={`${track.title} options`} className="song-menu" onClose={onClose}>
      <div className="dialog-head">
        <div className="menu-title">
          <span className="ttl">{track.title}</span>
          <span className="sub">{track.artist}</span>
        </div>
        <button className="sheet-close" data-autofocus aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {step === "actions" && (
        <ul className="menu-list">
          {items.map((item) => (
            <li key={item.label}>
              <button className={`menu-item${item.danger ? " is-danger" : ""}`} onClick={item.run}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {step === "pick" && <PlaylistPicker track={track} onDone={(message) => run(() => {}, message)} />}
      {step === "confirm" && (
        <Confirm
          message={
            track.source.kind === "linked"
              ? "This removes the song from TuneNook and its playlists. The file in your folder stays."
              : "This deletes TuneNook's copy of the song and removes it from every playlist. The original file isn't touched."
          }
          action="Remove song"
          onConfirm={() => run(() => void removeTracksSafely(new Set([track.id])), `Removed ${track.title}.`)}
          onCancel={() => setStep("actions")}
        />
      )}
      {error && (
        <p className="xh-help err" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function PlaylistPicker({ track, onDone }: { track: Track; onDone: (message: string) => void }) {
  const playlists = usePlaylists();
  const [name, setName] = useState("");

  return (
    <div className="picker">
      {playlists.length > 0 && (
        <ul className="menu-list">
          {playlists.map((p) => (
            <li key={p.id}>
              <button
                className="menu-item"
                onClick={() => {
                  void addToPlaylist(p.id, [track.id]);
                  onDone(`Added ${track.title} to ${p.name}.`);
                }}
              >
                {p.name}
                <span className="menu-note">{p.trackIds.includes(track.id) ? "Already in it" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void createPlaylist(name, [track.id]);
          onDone(`Added ${track.title} to ${name.trim()}.`);
        }}
      >
        <TextField
          label="New playlist"
          value={name}
          placeholder="Playlist name"
          onChange={(e) => setName(e.target.value)}
          suffix={
            <Button type="submit" variant="secondary" icon={<PlusIcon />} disabled={!name.trim()}>
              Create
            </Button>
          }
        />
      </form>
    </div>
  );
}

export function Confirm({
  message,
  action,
  onConfirm,
  onCancel,
}: {
  message: ReactNode;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm">
      <p>{message}</p>
      <div className="dialog-actions">
        <Button variant="secondary" className="remove" onClick={onConfirm}>
          {action}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
