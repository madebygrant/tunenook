import { useDeferredValue, useLayoutEffect, useMemo, useState } from "react";
import { compareText, plural } from "../lib/format";
import { useTracks } from "../lib/library";
import { playTracks } from "../lib/player";
import { matchesSearch, searchWords, useListPlayback } from "../lib/useListPlayback";
import { useSelection } from "../lib/useSelection";
import type { Track } from "../lib/types";
import { CheckIcon, ChevronDownIcon, PlayIcon, ShuffleIcon } from "./icons";
import { SearchField } from "./SearchField";
import { MenuSheet } from "./SongMenu";
import { ListBar } from "./Selection";
import { SongList } from "./SongList";
import { Button } from "./ui";

type Sort = "title" | "artist" | "album" | "added" | "played" | "plays";

const SORTS: [Sort, string][] = [
  ["title", "Title"],
  ["artist", "Artist"],
  ["album", "Album"],
  ["added", "Recently added"],
  ["played", "Recently played"],
  ["plays", "Most played"],
];

const SORT_KEY = "tunenook.songSort";

type PlayStats = Map<string, Pick<Track, "lastPlayedAt" | "playCount">>;

function playStats(list: Track[]): PlayStats {
  return new Map(list.map((t) => [t.id, { lastPlayedAt: t.lastPlayedAt, playCount: t.playCount }]));
}

// Play sorts use stats read when the page opened or the sort was picked, so rows don't jump when a play is counted.
function compare(sort: Sort, stats: PlayStats): (a: Track, b: Track) => number {
  const album = (a: Track, b: Track) => compareText(a.album, b.album) || (a.discNo ?? 1) - (b.discNo ?? 1) || (a.trackNo ?? 0) - (b.trackNo ?? 0);
  if (sort === "artist") return (a, b) => compareText(a.artist, b.artist) || album(a, b);
  if (sort === "album") return (a, b) => album(a, b) || compareText(a.title, b.title);
  if (sort === "added") return (a, b) => b.addedAt - a.addedAt;
  const of = (t: Track) => stats.get(t.id) ?? t;
  const recent = (a: Track, b: Track) => (of(b).lastPlayedAt ?? 0) - (of(a).lastPlayedAt ?? 0);
  if (sort === "played") return (a, b) => recent(a, b) || compareText(a.title, b.title);
  if (sort === "plays") return (a, b) => (of(b).playCount ?? 0) - (of(a).playCount ?? 0) || recent(a, b) || compareText(a.title, b.title);
  return (a, b) => compareText(a.title, b.title);
}

function loadSort(): Sort {
  try {
    const stored = localStorage.getItem(SORT_KEY);
    return SORTS.some(([s]) => s === stored) ? (stored as Sort) : "title";
  } catch {
    return "title";
  }
}

export function Songs({
  onMore,
  onAdd,
  onToast,
  focusId,
  onFocused,
}: {
  onMore: (track: Track) => void;
  onAdd: () => void;
  onToast: (message: string) => void;
  // A song to land on when the page opens, so the player can jump here to the current row.
  focusId?: string | null;
  onFocused?: () => void;
}) {
  const tracks = useTracks();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(loadSort);
  const [sortOpen, setSortOpen] = useState(false);
  const sortValue = SORTS.find(([value]) => value === sort)?.[1] ?? "Title";
  const [stats, setStats] = useState(() => playStats(tracks));
  // Deferred, so typing stays quick while a large library filters behind it.
  const search = useDeferredValue(query);
  // Sorted apart from the search, so a keystroke only filters; filtering keeps the order.
  const sorted = useMemo(() => [...tracks].sort(compare(sort, stats)), [tracks, sort, stats]);
  const shown = useMemo(() => {
    const words = searchWords(search);
    return words.length === 0 ? sorted : sorted.filter((t) => matchesSearch(t, words));
  }, [sorted, search]);
  const { currentIndex, playing, onPlay } = useListPlayback(shown);
  const ids = shown.map((t) => t.id);
  const selection = useSelection(shown);
  const focusIndex = focusId ? shown.findIndex((t) => t.id === focusId) : -1;
  // A search that hides the song we're landing on would leave nothing to scroll to, so it clears itself.
  const [handledFocus, setHandledFocus] = useState<string | null>(null);
  if ((focusId ?? null) !== handledFocus) {
    setHandledFocus(focusId ?? null);
    if (focusId && focusIndex < 0 && query) setQuery("");
  }

  // Landing on a song from the player: the row is brought to the middle once it's mounted.
  useLayoutEffect(() => {
    if (!focusId || focusIndex < 0) return;
    const row = document.querySelector<HTMLElement>(`.main .songs [data-index="${focusIndex}"]`);
    if (!row) return;
    row.scrollIntoView?.({ block: "center" });
    onFocused?.();
  }, [focusId, focusIndex, onFocused]);

  function changeSort(next: Sort) {
    setSort(next);
    setStats(playStats(tracks));
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
  }

  return (
    <section aria-labelledby="songs-title">
      <div className="page-head">
        <h1 id="songs-title" className="display-lg" tabIndex={-1}>
          Songs
        </h1>
        {tracks.length > 0 && <span className="count">{plural(tracks.length, "song")}</span>}
      </div>
      {tracks.length === 0 ? (
        <div className="empty">
          <h2 className="h3">No music yet</h2>
          <p className="muted">Add songs from your files. They're stored on this device and play with no connection.</p>
          <div className="head-actions">
            <Button onClick={onAdd}>Add music</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="head-actions transport">
            <Button small icon={<PlayIcon />} onClick={() => playTracks(ids, 0, { shuffle: false })} disabled={!ids.length}>
              Play
            </Button>
            <Button small variant="secondary" icon={<ShuffleIcon />} onClick={() => playTracks(ids, -1, { shuffle: true })} disabled={!ids.length}>
              Shuffle
            </Button>
          </div>
          <div className="list-tools">
            <SearchField label="Search songs, artists, albums" value={query} onChange={setQuery} />
            <div className="filters" role="group" aria-label="Sort by">
              {SORTS.map(([value, label]) => (
                <button key={value} className="filter" aria-pressed={sort === value} onClick={() => changeSort(value)}>
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="sort-choose"
              aria-haspopup="dialog"
              aria-expanded={sortOpen}
              aria-label={`Sort songs, currently ${sortValue}`}
              onClick={() => setSortOpen(true)}
            >
              <span className="ord">Sort</span>
              <span className="value">
                {sortValue}
                <ChevronDownIcon />
              </span>
            </button>
          </div>
          {shown.length === 0 ? (
            <p className="list-empty muted">No songs match “{search}”.</p>
          ) : (
            <>
              <ListBar selection={selection} tracks={shown} removal={{ kind: "library" }} onToast={onToast} />
              <SongList
                label="Songs"
                tracks={shown}
                currentIndex={currentIndex}
                playing={playing}
                onPlay={onPlay}
                onMore={(i) => onMore(shown[i])}
                selection={selection}
                pinnedIndex={focusIndex >= 0 ? focusIndex : null}
              />
            </>
          )}
          {sortOpen && (
            <MenuSheet label="Sort songs" title="Sort songs" subtitle="Order of the list" onClose={() => setSortOpen(false)}>
              <ul className="menu-list">
                {SORTS.map(([value, label]) => (
                  <li key={value}>
                    <button
                      className="menu-item"
                      aria-current={sort === value || undefined}
                      onClick={() => {
                        changeSort(value);
                        setSortOpen(false);
                      }}
                    >
                      {label}
                      {sort === value && <CheckIcon className="menu-pick" />}
                    </button>
                  </li>
                ))}
              </ul>
            </MenuSheet>
          )}
        </>
      )}
    </section>
  );
}
