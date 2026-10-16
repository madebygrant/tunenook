import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCloseOnBack } from "./history";
import { isShortcut } from "./keys";
import type { Track } from "./types";

// Playlists and the queue can hold a song twice, so a row is its song id plus which repeat of it this is.
export function rowKeys(tracks: Track[]): string[] {
  const seen = new Map<string, number>();
  return tracks.map((t) => {
    const n = seen.get(t.id) ?? 0;
    seen.set(t.id, n + 1);
    return `${t.id}#${n}`;
  });
}

export interface Selection {
  active: boolean;
  start: () => void;
  stop: () => void;
  isSelected: (index: number) => boolean;
  // range extends from the last row toggled, as shift-click does.
  toggle: (index: number, range: boolean) => void;
  selectAll: () => void;
  indexes: number[];
}

// keys overrides the row keys, for lists whose rows have a steadier identity than their song, such as queue slots.
export function useSelection(tracks: Track[], keys?: string[]): Selection {
  const [active, setActive] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  // A row key, not an index, so a range still starts from the same song after a sort or search.
  const anchor = useRef<string | null>(null);
  const derived = useMemo(() => rowKeys(tracks), [tracks]);
  const rows = keys ?? derived;

  const stop = useCallback(() => {
    setActive(false);
    setChosen(new Set());
    anchor.current = null;
  }, []);

  useCloseOnBack(stop, active);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isShortcut(e)) stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stop]);

  // Rows hidden by a search or removed from the list don't count, so actions only touch what's on screen.
  const indexes = rows.flatMap((key, i) => (chosen.has(key) ? [i] : []));

  return {
    active,
    start: () => setActive(true),
    stop,
    isSelected: (i) => chosen.has(rows[i]),
    toggle(i, range) {
      const from = anchor.current === null ? -1 : rows.indexOf(anchor.current);
      anchor.current = rows[i];
      setChosen((prev) => {
        const next = new Set(prev);
        if (range && from >= 0) {
          for (let j = Math.min(from, i); j <= Math.max(from, i); j++) next.add(rows[j]);
        } else if (next.has(rows[i])) next.delete(rows[i]);
        else next.add(rows[i]);
        return next;
      });
    },
    selectAll: () => setChosen(new Set(rows)),
    indexes,
  };
}
