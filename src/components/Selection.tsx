import { useState, type ReactNode } from "react";
import { plural } from "../lib/format";
import { removeTracksSafely } from "../lib/library";
import { addToQueue, playNext } from "../lib/player";
import { libraryRemovalMessage } from "../lib/removal";
import type { Track } from "../lib/types";
import type { Selection } from "../lib/useSelection";
import { CheckIcon, CloseIcon, PlusIcon, TrashIcon } from "./icons";
import { Confirm, MenuSheet, PlaylistPicker } from "./SongMenu";
import { Button } from "./ui";

export type Removal = { kind: "library" } | { kind: "custom"; label: string; run: (indexes: number[]) => void };

export function SelectionBar({
  selection,
  tracks,
  removal,
  onToast,
}: {
  selection: Selection;
  tracks: Track[];
  removal: Removal;
  onToast: (message: string) => void;
}) {
  const [sheet, setSheet] = useState<"pick" | "confirm" | null>(null);
  const { indexes } = selection;
  const chosen = indexes.map((i) => tracks[i]);
  const ids = chosen.map((t) => t.id);
  const name = plural(ids.length, "song");
  const none = ids.length === 0;

  function finish(message: string) {
    setSheet(null);
    selection.stop();
    onToast(message);
  }

  return (
    <div className="head-actions selection-bar" role="toolbar" aria-label="Selected songs">
      <span className="selection-count" aria-live="polite">
        {ids.length ? `${name} selected` : "Select songs"}
      </span>
      {indexes.length < tracks.length && (
        <Button variant="ghost" small icon={<CheckIcon />} onClick={selection.selectAll}>
          Select all
        </Button>
      )}
      <Button variant="secondary" small icon={<PlusIcon />} disabled={none} onClick={() => setSheet("pick")}>
        Add to playlist
      </Button>
      <Button
        variant="secondary"
        small
        disabled={none}
        onClick={() => {
          playNext(ids);
          finish(ids.length === 1 ? `${chosen[0].title} plays next.` : `${name} play next.`);
        }}
      >
        Play next
      </Button>
      <Button
        variant="secondary"
        small
        disabled={none}
        onClick={() => {
          addToQueue(ids);
          finish(`Added ${name} to the queue.`);
        }}
      >
        Add to queue
      </Button>
      <Button
        variant="secondary"
        small
        className="remove"
        icon={<TrashIcon />}
        disabled={none}
        onClick={() => {
          if (removal.kind === "library") return setSheet("confirm");
          removal.run(indexes);
          selection.stop();
        }}
      >
        {removal.kind === "library" ? "Remove…" : removal.label}
      </Button>
      <Button variant="ghost" small icon={<CloseIcon />} onClick={selection.stop}>
        Done
      </Button>
      {sheet === "pick" && (
        <MenuSheet label={`Add ${name} to a playlist`} title={`Add ${name}`} subtitle="To a playlist" onClose={() => setSheet(null)}>
          <PlaylistPicker ids={ids} name={name} onDone={finish} />
        </MenuSheet>
      )}
      {sheet === "confirm" && (
        <MenuSheet label={`Remove ${name}`} title={`Remove ${name}?`} subtitle="From your library" onClose={() => setSheet(null)}>
          <Confirm
            message={libraryRemovalMessage(chosen)}
            action={`Remove ${name}`}
            onCancel={() => setSheet(null)}
            onConfirm={() => {
              void removeTracksSafely(new Set(ids));
              finish(`Removed ${name}.`);
            }}
          />
        </MenuSheet>
      )}
    </div>
  );
}

// The page's own buttons, swapped for the selection bar while selecting.
export function SelectableActions({
  selection,
  tracks,
  removal,
  onToast,
  children,
}: {
  selection: Selection;
  tracks: Track[];
  removal: Removal;
  onToast: (message: string) => void;
  children: ReactNode;
}) {
  if (selection.active) return <SelectionBar selection={selection} tracks={tracks} removal={removal} onToast={onToast} />;
  return <div className="head-actions">{children}</div>;
}

// Above a page's song list, so Select sits next to the songs it acts on.
export function ListBar({
  selection,
  tracks,
  removal,
  onToast,
}: {
  selection: Selection;
  tracks: Track[];
  removal: Removal;
  onToast: (message: string) => void;
}) {
  return (
    <div className="list-bar">
      <SelectableActions selection={selection} tracks={tracks} removal={removal} onToast={onToast}>
        <SelectButton small selection={selection} />
      </SelectableActions>
    </div>
  );
}

export function SelectButton({ selection, disabled, small }: { selection: Selection; disabled?: boolean; small?: boolean }) {
  return (
    <Button variant="ghost" small={small} icon={<CheckIcon />} disabled={disabled} onClick={selection.start}>
      Select
    </Button>
  );
}
