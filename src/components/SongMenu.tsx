import { useRef, useState, type ReactNode } from "react";
import { plural } from "../lib/format";
import { canLinkFolders, copyIntoLibrary, NeedsAccessError, requestAccess } from "../lib/folders";
import { addToPlaylist, artistPageFor, createPlaylist, toggleLike, getPlaylists, removeTracksSafely, savePlaylist, usePlaylists } from "../lib/library";
import { addToQueue, playNext, removeFromQueue } from "../lib/player";
import { movePlaylistRow, visiblePositions } from "../lib/playlistMoves";
import { missingFrom, withoutIndexes } from "../lib/playlists";
import { libraryRemovalMessage } from "../lib/removal";
import { albumKey } from "../lib/tags";
import type { Playlist, Track } from "../lib/types";
import { Dialog } from "./Dialog";
import { TrackDetails } from "./EditDetails";
import { CloseIcon, PlusIcon } from "./icons";
import { Button, TextField } from "./ui";
import type { View } from "./Sidebar";

export type MenuContext =
  | { kind: "library" }
  // index is the position in the playlist, for removal; row is the place among the songs shown, for moves.
  | { kind: "playlist"; playlistId: string; index: number; row: number }
  | { kind: "queue"; pos: number };

export interface MenuTarget {
  track: Track;
  context: MenuContext;
}

interface Props {
  target: MenuTarget;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onEdited: (before: Track, after: Track) => void;
  onToast: (message: string, undo?: () => void) => void;
}

export function SongMenu({ target, onClose, onNavigate, onEdited, onToast }: Props) {
  const { track, context } = target;
  const [step, setStep] = useState<"actions" | "pick" | "confirm" | "edit">("actions");
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

  const items: MenuItem[] = [
    { label: "Play next", run: () => run(() => playNext([track.id]), `${track.title} plays next.`) },
    { label: "Add to queue", run: () => run(() => addToQueue([track.id]), `Added ${track.title} to the queue.`) },
    { label: "Add to playlist…", run: () => setStep("pick") },
    {
      label: track.likedAt === undefined ? "Like" : "Unlike",
      run: () => run(() => void toggleLike(track.id)),
    },
    { label: "Edit details…", run: () => setStep("edit") },
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
    const { index, row } = context;
    const now = Date.now();
    const last = visiblePositions(playlist).length - 1;
    const move = (to: number) => () => run(() => movePlaylistRow(playlist.id, row, to));
    if (row > 0) items.push({ label: "Move to top", run: move(0) }, { label: "Move up", run: move(row - 1) });
    if (row < last) items.push({ label: "Move down", run: move(row + 1) }, { label: "Move to bottom", run: move(last) });
    items.push({
      label: "Remove from playlist",
      danger: true,
      run: () => editPlaylist((p) => withoutIndexes(p, new Set([index]), now), `Removed ${track.title} from ${playlist.name}.`),
    });
  }
  if (context.kind === "queue") {
    items.push({ label: "Remove from queue", danger: true, run: () => run(() => removeFromQueue([context.pos])) });
  }
  if (canLinkFolders && track.source.kind === "linked") items.push({ label: "Copy into TuneNook", run: () => void copy() });
  if (context.kind === "library") items.push({ label: "Remove from library…", danger: true, run: () => setStep("confirm") });

  return (
    <MenuSheet label={`${track.title} options`} title={track.title} subtitle={track.artist} onClose={onClose}>
      {step === "actions" && <MenuList items={items} />}
      {step === "edit" && <TrackDetails track={track} onSaved={(message, edited) => run(() => onEdited(track, edited), message)} onCancel={() => setStep("actions")} />}
      {step === "pick" && <PlaylistPicker ids={[track.id]} name={track.title} onDone={(message) => run(() => {}, message)} />}
      {step === "confirm" && (
        <Confirm
          message={libraryRemovalMessage([track])}
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
    </MenuSheet>
  );
}

export interface MenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
  // Opens a file picker instead; run is called once a file is chosen.
  pick?: { accept: string; onPick: (file: File) => void };
}

export function MenuSheet({
  label,
  title,
  subtitle,
  onClose,
  children,
}: {
  label: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog label={label} className="song-menu" onClose={onClose}>
      <div className="dialog-head">
        <div className="menu-title">
          <span className="ttl">{title}</span>
          <span className="sub">{subtitle}</span>
        </div>
        <button className="sheet-close" data-autofocus aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {children}
    </Dialog>
  );
}

function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <ul className="menu-list">
      {items.map((item) => (
        <li key={item.label}>
          {item.pick ? (
            <FileMenuItem item={item} pick={item.pick} />
          ) : (
            <button className={`menu-item${item.danger ? " is-danger" : ""}`} onClick={item.run}>
              {item.label}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// The input sits in the sheet, since the page behind it is inert while the sheet is open.
function FileMenuItem({ item, pick }: { item: MenuItem; pick: NonNullable<MenuItem["pick"]> }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="menu-item" onClick={() => input.current?.click()}>
        {item.label}
      </button>
      <input
        ref={input}
        type="file"
        accept={pick.accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          item.run();
          pick.onPick(file);
        }}
      />
    </>
  );
}

// name is what the toast calls the songs being added: a song title, or an album, playlist or "the queue".
export function PlaylistPicker({
  ids,
  name,
  excludeId,
  onDone,
}: {
  ids: string[];
  name: string;
  excludeId?: string;
  onDone: (message: string) => void;
}) {
  const playlists = usePlaylists().filter((p) => p.id !== excludeId);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  // State alone can't stop a second submit fired before React re-renders.
  const busy = useRef(false);

  function addTo(p: Playlist) {
    // A single song may repeat in a playlist, as before; a whole collection only fills in what's missing.
    const adding = ids.length === 1 ? ids : missingFrom(p, ids);
    if (adding.length === 0) return onDone(`${p.name} already has every song.`);
    void addToPlaylist(p.id, adding);
    const skipped = ids.length - adding.length;
    if (!skipped) return onDone(`Added ${name} to ${p.name}.`);
    const already = skipped === 1 ? "1 was already in it" : `${skipped} were already in it`;
    onDone(`Added ${plural(adding.length, "song")} to ${p.name}. ${already}.`);
  }

  return (
    <div className="picker">
      {playlists.length > 0 && (
        <ul className="menu-list">
          {playlists.map((p) => (
            <li key={p.id}>
              <button className="menu-item" onClick={() => addTo(p)}>
                {p.name}
                <span className="menu-note">{missingFrom(p, ids).length === 0 ? "Already in it" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim() || busy.current) return;
          busy.current = true;
          setSaving(true);
          const created = await createPlaylist(newName, ids);
          busy.current = false;
          setSaving(false);
          // On failure the library reports it and the form stays open with the name, for another try.
          if (created) onDone(`Added ${name} to ${created.name}.`);
        }}
      >
        <TextField
          label="New playlist"
          value={newName}
          placeholder="Playlist name"
          onChange={(e) => setNewName(e.target.value)}
          suffix={
            <Button type="submit" variant="secondary" icon={<PlusIcon />} disabled={!newName.trim() || saving}>
              Create
            </Button>
          }
        />
      </form>
    </div>
  );
}

// Actions on a whole album or playlist. excludePlaylistId keeps a playlist from being offered to itself.
export function CollectionMenu({
  title,
  subtitle,
  ids,
  excludePlaylistId,
  extraItems = [],
  onClose,
  onToast,
}: {
  title: string;
  subtitle: string;
  ids: string[];
  excludePlaylistId?: string;
  extraItems?: MenuItem[];
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const done = (message: string) => {
    onClose();
    onToast(message);
  };
  const items: MenuItem[] = [
    {
      label: "Play next",
      run: () => {
        playNext(ids);
        done(`${title} plays next.`);
      },
    },
    {
      label: "Add to queue",
      run: () => {
        addToQueue(ids);
        done(`Added ${title} to the queue.`);
      },
    },
    { label: "Add to playlist…", run: () => setPicking(true) },
    ...extraItems,
  ];

  return (
    <MenuSheet label={`${title} options`} title={title} subtitle={subtitle} onClose={onClose}>
      {picking ? <PlaylistPicker ids={ids} name={title} excludeId={excludePlaylistId} onDone={done} /> : <MenuList items={items} />}
    </MenuSheet>
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
