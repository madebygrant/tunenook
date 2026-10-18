import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatClock } from "../lib/format";
import { rowRuns, useRowWindow, WINDOW_FROM } from "../lib/rowWindow";
import { useRowDrag } from "../lib/useRowDrag";
import type { Track } from "../lib/types";
import { CheckIcon, GripIcon, MoreIcon, PauseIcon, PlayIcon } from "./icons";
import { rowKeys, type Selection } from "../lib/useSelection";
import { CoverArt } from "./ui";

interface Props {
  tracks: Track[];
  // Which row is the song that's loaded. Playlists and the queue can hold a song twice, so it's an index.
  currentIndex: number | null;
  playing: boolean;
  numbered?: boolean;
  showAlbum?: boolean;
  onPlay: (index: number) => void;
  onMore: (index: number) => void;
  label: string;
  // While a selection is active, tapping a row selects it instead of playing.
  selection?: Selection;
  // Rows get a handle that drags, or moves with the arrow keys.
  onReorder?: (from: number, to: number) => void;
  // A row that must stay mounted even when the list is windowed, so it can be scrolled to.
  pinnedIndex?: number | null;
}

export function SongList({ tracks, currentIndex, playing, numbered, showAlbum = true, onPlay, onMore, label, selection, onReorder, pinnedIndex }: Props) {
  const selecting = selection?.active ? selection : null;
  const list = useRef<HTMLUListElement>(null);
  // Keyed by song rather than position, so a moved row keeps its element and its handle keeps focus.
  const keys = useMemo(() => rowKeys(tracks), [tracks]);
  const { drag, start, cancel } = useRowDrag(list, keys, (from, to) => onReorder?.(from, to));

  const isSelecting = selecting !== null;
  useEffect(() => {
    if (isSelecting) cancel();
  }, [isSelecting, cancel]);

  // Long lists only mount the rows near the screen. The focused and dragged rows stay mounted wherever they are,
  // so focus isn't dropped and a drag isn't lost when they scroll away.
  const windowed = tracks.length > WINDOW_FROM;
  const range = useRowWindow(list, tracks.length, windowed);
  // By song, so the row stays pinned when a move or a new song in the queue changes its position.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const focused = windowed && focusedKey !== null ? keys.indexOf(focusedKey) : -1;
  const runs = windowed
    ? rowRuns(tracks.length, { start: range.start, end: Math.min(range.end, tracks.length) }, [focused, drag?.from, pinnedIndex ?? null])
    : [{ from: 0, to: tracks.length }];
  const gapHeight = range.rowHeight || 64;

  function step(i: number, by: number) {
    const to = i + by;
    if (onReorder && to >= 0 && to < tracks.length) onReorder(i, to);
  }

  return (
    <ul
      ref={list}
      className={`songs${windowed ? " is-windowed" : ""}${selecting ? " is-selecting" : ""}${drag ? " is-dragging" : ""}`}
      aria-label={label}
      onFocus={(e) => {
        if (!windowed) return;
        const index = e.target.closest<HTMLElement>("[data-index]")?.dataset.index;
        setFocusedKey(index === undefined ? null : (keys[Number(index)] ?? null));
      }}
      onBlur={(e) => {
        if (windowed && !e.currentTarget.contains(e.relatedTarget)) setFocusedKey(null);
      }}
    >
      {withGaps(runs, tracks.length, gapHeight, (i) => {
        const t = tracks[i];
        const position = windowed ? { "aria-posinset": i + 1, "aria-setsize": tracks.length, "data-index": i } : { "data-index": i };
        const current = i === currentIndex;
        const sub = showAlbum && t.album ? `${t.artist} · ${t.album}` : t.artist;
        if (selecting) {
          const selected = selecting.isSelected(i);
          return (
            <li key={keys[i]} className={`song${selected ? " is-selected" : ""}`} {...position}>
              <button
                className="song-main"
                aria-pressed={selected}
                aria-label={`Select ${t.title} by ${t.artist}`}
                onClick={(e) => selecting.toggle(i, e.shiftKey)}
              >
                <span className="song-check" aria-hidden="true">
                  {selected && <CheckIcon />}
                </span>
                <span className="song-text">
                  <span className="ttl">{t.title}</span>
                  <span className="sub">{sub}</span>
                </span>
                <span className="song-dur">{t.duration ? formatClock(t.duration) : ""}</span>
              </button>
            </li>
          );
        }
        const dragged = drag?.from === i;
        // Rows between the dragged row and its drop point slide over to open a gap where it will land.
        const shift = !drag || dragged ? 0 : i > drag.from && i <= drag.to ? -1 : i < drag.from && i >= drag.to ? 1 : 0;
        return (
          <li
            key={keys[i]}
            className={`song${current ? " is-current" : ""}${dragged ? " is-dragged" : ""}`}
            {...position}
            // The dragged row's offset is written by the drag itself, so React leaves its style alone.
            style={drag && !dragged ? ({ "--drag-y": `${shift * drag.height}px` } as CSSProperties) : undefined}
          >
            {onReorder && (
              <button
                className="xh-icon-btn song-grip"
                aria-label={`Move ${t.title}, position ${i + 1} of ${tracks.length}. Drag, or use the arrow keys.`}
                onPointerDown={(e) => start(e, i)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                  e.preventDefault();
                  step(i, e.key === "ArrowUp" ? -1 : 1);
                }}
              >
                <GripIcon />
              </button>
            )}
            <button
              className="song-main"
              aria-label={`${current && playing ? "Pause" : "Play"} ${t.title} by ${t.artist}`}
              aria-current={current ? "true" : undefined}
              onClick={() => onPlay(i)}
            >
              {numbered ? (
                <span className="song-no" aria-hidden="true">
                  {current ? playing ? <PauseIcon /> : <PlayIcon /> : (t.trackNo ?? "·")}
                </span>
              ) : (
                <span className="song-art">
                  <CoverArt artId={t.artId} title={t.album || t.title} size={40} />
                  {current && <span className="song-state">{playing ? <PauseIcon /> : <PlayIcon />}</span>}
                </span>
              )}
              <span className="song-text">
                <span className="ttl">{t.title}</span>
                <span className="sub">{sub}</span>
              </span>
              <span className="song-dur">{t.duration ? formatClock(t.duration) : ""}</span>
            </button>
            <button className="xh-icon-btn song-more" aria-label={`More for ${t.title}`} onClick={() => onMore(i)}>
              <MoreIcon />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Rows that aren't mounted are stood in for by empty items of the same height, so the scroll length stays right.
function withGaps(runs: { from: number; to: number }[], count: number, rowHeight: number, row: (i: number) => ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let next = 0;
  const gap = (from: number, to: number) =>
    to > from && out.push(<li key={`gap-${from}`} className="song-gap" aria-hidden="true" style={{ height: (to - from) * rowHeight }} />);
  for (const run of runs) {
    gap(next, run.from);
    for (let i = run.from; i < run.to; i++) out.push(row(i));
    next = run.to;
  }
  gap(next, count);
  return out;
}
