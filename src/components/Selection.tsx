import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { plural } from "../lib/format";
import { removeTracksSafely } from "../lib/library";
import { addToQueue, playNext } from "../lib/player";
import { libraryRemovalMessage } from "../lib/removal";
import type { Track } from "../lib/types";
import type { Selection } from "../lib/useSelection";
import { CheckIcon, CloseIcon, NextIcon, PlaylistIcon, QueueIcon, TrashIcon } from "./icons";
import { Confirm, MenuSheet, PlaylistPicker } from "./SongMenu";
import { Button } from "./ui";

// short is the bar's visible label where label is too long for it.
export type Removal = { kind: "library" } | { kind: "custom"; label: string; short?: string; run: (indexes: number[]) => void };

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
  const [host] = useState(() => document.querySelector(".app") ?? document.body);
  const dock = useRef<HTMLDivElement>(null);
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

  // Focus moves into the bar, which sits after the page in tab order, and back to Select once it closes.
  useEffect(() => {
    dock.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      if (document.activeElement === document.body) document.querySelector<HTMLElement>("[data-select-button]")?.focus();
    };
  }, []);

  // Takes the player's place at the foot of the screen, so the actions stay in reach however far the list scrolls.
  return createPortal(
    <div ref={dock} className="selection-dock" role="toolbar" aria-label="Selected songs">
      <div className="selection-head">
        <span className="selection-count" aria-live="polite">
          {ids.length ? `${name} selected` : "Select songs"}
        </span>
        {indexes.length < tracks.length && (
          <Button variant="ghost" small onClick={selection.selectAll}>
            Select all
          </Button>
        )}
        <Button variant="ghost" small icon={<CloseIcon />} className="selection-done" onClick={selection.stop}>
          Done
        </Button>
      </div>
      <div className="selection-actions">
        <button type="button" className="selection-action" disabled={none} onClick={() => setSheet("pick")}>
          <PlaylistIcon />
          Add to playlist
        </button>
        <button
          type="button"
          className="selection-action"
          disabled={none}
          onClick={() => {
            playNext(ids);
            finish(ids.length === 1 ? `${chosen[0].title} plays next.` : `${name} play next.`);
          }}
        >
          <NextIcon />
          Play next
        </button>
        <button
          type="button"
          className="selection-action"
          disabled={none}
          onClick={() => {
            addToQueue(ids);
            finish(`Added ${name} to the queue.`);
          }}
        >
          <QueueIcon />
          Add to queue
        </button>
        <button
          type="button"
          className="selection-action remove"
          aria-label={removal.kind === "library" ? undefined : removal.label}
          disabled={none}
          onClick={() => {
            if (removal.kind === "library") return setSheet("confirm");
            removal.run(indexes);
            selection.stop();
          }}
        >
          <TrashIcon />
          {removal.kind === "library" ? "Remove…" : (removal.short ?? removal.label)}
        </button>
      </div>
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
    </div>,
    host,
  );
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
      <div className="head-actions">
        {selection.active ? (
          <>
            <span className="list-bar-hint">Pick the songs you want</span>
            <SelectionBar selection={selection} tracks={tracks} removal={removal} onToast={onToast} />
          </>
        ) : (
          <SelectButton small selection={selection} />
        )}
      </div>
    </div>
  );
}

export function SelectButton({ selection, disabled, small }: { selection: Selection; disabled?: boolean; small?: boolean }) {
  return (
    <Button variant="ghost" small={small} icon={<CheckIcon />} disabled={disabled} data-select-button onClick={selection.start}>
      Select
    </Button>
  );
}
