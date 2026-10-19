import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatBytes, plural } from "../lib/format";
import { useJob } from "../lib/job";
import { artBytes, useAlbums, usePlaylists, usePlays, useRemovedSongs, useTrackMap, useTracks } from "../lib/library";
import { useStorage } from "../lib/storage";
import { audioBytes, largestAlbums, largestSongs, playlistSizes, share, usageParts, type PartKey } from "../lib/storageUse";
import type { Track } from "../lib/types";
import { ArrowLeftIcon } from "./icons";
import { Button } from "./ui";

const TOP = 10;

// Colours follow the part, never its size, and are validated as neighbours in this order.
const COLOUR: Record<PartKey, string> = {
  audio: "var(--viz-1)",
  art: "var(--viz-2)",
  details: "var(--viz-3)",
  history: "var(--viz-4)",
  other: "var(--viz-rest)",
};

// formatBytes never goes below 1 KB, which would make an empty part look used.
const size = (bytes: number | null) => (bytes === null ? "Couldn't measure" : bytes === 0 ? "None" : formatBytes(bytes));

interface Row {
  key: string;
  title: string;
  sub: string;
  bytes: number;
  onOpen?: () => void;
}

function SizeList({ label, rows }: { label: string; rows: Row[] }) {
  const max = rows[0]?.bytes ?? 0;
  return (
    <ul className="size-list" aria-label={label}>
      {rows.map((r) => {
        const body = (
          <>
            <span className="size-text">
              <span className="ttl">{r.title}</span>
              <span className="sub">{r.sub}</span>
            </span>
            <span className="size-value">{size(r.bytes)}</span>
            <span className="size-bar" aria-hidden="true">
              <span style={{ width: `${max ? (r.bytes / max) * 100 : 0}%` }} />
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.onOpen ? (
              <button className="size-row" onClick={r.onOpen}>
                {body}
              </button>
            ) : (
              <div className="size-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function StoragePage({
  onBack,
  onOpenAlbum,
  onMore,
}: {
  onBack: () => void;
  onOpenAlbum: (key: string) => void;
  onMore: (track: Track) => void;
}) {
  const tracks = useTracks();
  const byId = useTrackMap();
  const albums = useAlbums();
  const playlists = usePlaylists();
  const plays = usePlays();
  const removed = useRemovedSongs();
  const busy = useJob()?.running ?? false;
  const artCount = useMemo(() => new Set(tracks.map((t) => t.artId)).size, [tracks]);
  // Plays change the song list often, so this keys on what moves sizes: songs and covers coming and going, and
  // stored songs shrinking as their covers are dropped. An import's are read once it's done.
  const measureKey = busy ? null : `${tracks.length}:${artCount}:${audioBytes(tracks)}`;
  const storage = useStorage(measureKey ?? "busy");
  const [art, setArt] = useState<{ key: string; bytes: number | null } | null>(null);
  const [active, setActive] = useState<PartKey | null>(null);

  useEffect(() => {
    if (measureKey === null) return;
    let live = true;
    artBytes().then(
      (bytes) => live && setArt({ key: measureKey, bytes }),
      () => live && setArt({ key: measureKey, bytes: null }),
    );
    return () => {
      live = false;
    };
  }, [measureKey]);

  const measured = art !== null && art.key === measureKey;
  const parts = useMemo(
    () => (measured ? usageParts({ tracks, playlists, plays, removed, artBytes: art.bytes, usage: storage?.usage ?? null }) : []),
    [measured, tracks, playlists, plays, removed, art, storage],
  );
  const total = parts.reduce((n, p) => n + (p.bytes ?? 0), 0);
  const shown = parts.find((p) => p.key === active);
  const linked = tracks.filter((t) => t.source.kind === "linked").length;

  const albumRows = largestAlbums(albums, TOP).map(({ item: a, bytes }) => ({
    key: a.key,
    title: a.title,
    sub: `${a.artist} · ${plural(a.tracks.length, "song")}`,
    bytes,
    onOpen: () => onOpenAlbum(a.key),
  }));
  const songRows = largestSongs(tracks, TOP).map(({ item: t, bytes }) => ({
    key: t.id,
    title: t.title,
    sub: t.artist,
    bytes,
    onOpen: () => onMore(t),
  }));
  // Counted once each, matching the size.
  const playlistRows = playlistSizes(playlists, byId)
    .filter((p) => p.bytes > 0)
    .map(({ item: p, bytes }) => ({ key: p.id, title: p.name, sub: plural(new Set(p.trackIds).size, "song"), bytes }));

  return (
    <section aria-labelledby="storage-title">
      <Button variant="ghost" className="back" icon={<ArrowLeftIcon />} onClick={onBack}>
        Add music
      </Button>
      <div className="page-head">
        <h1 id="storage-title" className="display-lg" tabIndex={-1}>
          Storage
        </h1>
      </div>
      {storage && (
        <p className="review-summary muted">
          Using <b className="mono">{formatBytes(storage.usage)}</b> of about <b className="mono">{formatBytes(storage.quota)}</b> available to
          TuneNook.
        </p>
      )}
      {!measured ? (
        <p className="list-empty muted">{busy ? "Sizes update when the current task finishes." : "Measuring…"}</p>
      ) : (
        <div className="usage">
          <p className="usage-tip" aria-hidden="true">
            {shown ? [shown.label, size(shown.bytes), shown.bytes !== null && share(shown.bytes, total)].filter(Boolean).join(" · ") : "Hover or tap a part for its size."}
          </p>
          <div className={`usage-bar${active ? " is-active" : ""}`} aria-hidden="true" onPointerLeave={() => setActive(null)}>
            {parts.map((p) => (
              <span
                key={p.key}
                className={`usage-seg${p.key === active ? " is-active" : ""}`}
                style={{ flexGrow: p.bytes ?? 0, "--seg": COLOUR[p.key] } as CSSProperties}
                onPointerEnter={() => setActive(p.key)}
                onClick={() => setActive(p.key)}
              />
            ))}
          </div>
          <ul className="usage-legend" aria-label="Space by kind">
            {parts.map((p) => (
              <li
                key={p.key}
                className={p.key === active ? "is-active" : undefined}
                onPointerEnter={() => setActive(p.key)}
                onPointerLeave={() => setActive(null)}
              >
                <span className="swatch" style={{ "--seg": COLOUR[p.key] } as CSSProperties} aria-hidden="true" />
                <span>{p.label}</span>
                <span className="size-value">{size(p.bytes)}</span>
                <span className="usage-share">{p.bytes === null ? "" : share(p.bytes, total)}</span>
              </li>
            ))}
          </ul>
          <p className="usage-note muted">
            Song details and play history are measured as the data they hold, so their sizes are close, not exact.
            {linked > 0 && ` ${plural(linked, "song")} from linked folders stay in their folders and take no space here.`}
          </p>
        </div>
      )}
      {albumRows.length > 0 && (
        <>
          <h2 className="h3 section-title">Largest albums</h2>
          <SizeList label="Largest albums" rows={albumRows} />
        </>
      )}
      {songRows.length > 0 && (
        <>
          <h2 className="h3 section-title">Largest songs</h2>
          <SizeList label="Largest songs" rows={songRows} />
        </>
      )}
      {playlistRows.length > 0 && (
        <>
          <h2 className="h3 section-title">Playlists</h2>
          <p className="muted usage-note">What each playlist's songs take up. Songs are stored once, however many playlists they're in.</p>
          <SizeList label="Playlists by size" rows={playlistRows} />
        </>
      )}
    </section>
  );
}
