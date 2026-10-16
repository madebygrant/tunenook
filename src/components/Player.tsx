import { useEffect, useState, type CSSProperties } from "react";
import { requestAccess } from "../lib/folders";
import { formatClock } from "../lib/format";
import { useTrackMap } from "../lib/library";
import {
  cycleRepeat,
  hasNext,
  next,
  previous,
  retry,
  seek,
  seekBy,
  SEEK_SECONDS,
  toggle,
  toggleShuffle,
  useDuration,
  useNowPlaying,
  usePosition,
  useQueue,
} from "../lib/player";
import { idAt } from "../lib/queue";
import { albumKey } from "../lib/tags";
import { Dialog } from "./Dialog";
import { ChevronDownIcon, CloseIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RefreshIcon, RepeatIcon, RepeatOneIcon, ShuffleIcon } from "./icons";
import type { View } from "./Sidebar";
import { Button, CoverArt } from "./ui";

const COLLAPSED_KEY = "tunenook.dockCollapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Player({ onNavigate }: { onNavigate: (view: View) => void }) {
  const now = useNowPlaying();
  const queue = useQueue();
  const byId = useTrackMap();
  const time = usePosition();
  const duration = useDuration();
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const track = now.id ? byId.get(now.id) : undefined;
  const failure = now.failure;
  const canNext = hasNext(queue);
  const upNext = canNext ? byId.get(idAt(queue, (queue.at + 1) % queue.order.length)) : undefined;

  // Space and the arrow keys are left alone on controls, which already act on them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest("input, textarea, select, button, a, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (e.code === "Space") toggle();
      else if (e.key === "ArrowLeft") seekBy(-SEEK_SECONDS);
      else if (e.key === "ArrowRight") seekBy(SEEK_SECONDS);
      else if (key === "n") next();
      else if (key === "p") previous();
      else if (key === "s") toggleShuffle();
      else if (key === "r") cycleRepeat();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!track) return null;

  function toggleCollapsed() {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
  }

  const known = Number.isFinite(duration) && duration > 0;
  const shownTime = known ? Math.min(time, duration) : time;
  const label = `${now.playing ? "Pause" : "Play"} ${track.title}`;

  const transport = (
    <div className="xh-transport">
      <button className="xh-icon-btn" aria-label="Previous song" title="Previous (P)" onClick={previous}>
        <PrevIcon />
      </button>
      <button className="xh-play" aria-label={label} title={`${now.playing ? "Pause" : "Play"} (Space)`} onClick={toggle}>
        {now.playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button className="xh-icon-btn" aria-label="Next song" title="Next (N)" disabled={!canNext} onClick={next}>
        <NextIcon />
      </button>
    </div>
  );

  const repeatLabel = queue.repeat === "off" ? "Repeat off" : queue.repeat === "all" ? "Repeat all" : "Repeat one";
  const modes = (
    <div className="modes">
      <button
        className="mode-btn"
        aria-pressed={queue.shuffle}
        aria-label="Shuffle"
        title={`Shuffle ${queue.shuffle ? "on" : "off"} (S)`}
        onClick={toggleShuffle}
      >
        <ShuffleIcon />
      </button>
      <button
        className="mode-btn"
        aria-pressed={queue.repeat !== "off"}
        aria-label={`${repeatLabel}. Change repeat`}
        title={`${repeatLabel} (R)`}
        onClick={cycleRepeat}
      >
        {queue.repeat === "one" ? <RepeatOneIcon /> : <RepeatIcon />}
      </button>
    </div>
  );

  const seekRow = (dock: boolean) =>
    failure ? (
      <div className="player-error" role={dock ? "alert" : undefined}>
        <p>{failure.kind === "access" ? "TuneNook needs access to this song's folder again." : "Can't play this file."}</p>
        <div className="actions">
          {failure.kind === "access" ? (
            <Button variant="secondary" small onClick={() => void requestAccess(failure.folderId).then((ok) => ok && retry())}>
              Allow access
            </Button>
          ) : (
            <Button variant="secondary" small icon={<RefreshIcon />} onClick={retry}>
              Try again
            </Button>
          )}
          {canNext && (
            <Button variant="ghost" small onClick={next}>
              Skip
            </Button>
          )}
        </div>
      </div>
    ) : (
      <div className="xh-progress">
        <span aria-hidden="true">{formatClock(shownTime)}</span>
        <input
          className="seek"
          type="range"
          aria-label="Seek"
          aria-valuetext={known ? `${formatClock(shownTime)} of ${formatClock(duration)}` : formatClock(shownTime)}
          min={0}
          max={known ? duration : 0}
          step={1}
          value={shownTime}
          disabled={!known}
          style={{ "--pct": known ? `${(shownTime / duration) * 100}%` : "0%" } as CSSProperties}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span aria-hidden="true">{known ? `-${formatClock(Math.max(0, duration - shownTime))}` : "--:--"}</span>
      </div>
    );

  const albumView: View | null = track.album ? { kind: "album", key: albumKey(track.albumArtist || track.artist, track.album) } : null;

  return (
    <div className={`xh-player${collapsed ? " is-collapsed" : ""}`} role="region" aria-label="Player">
      <CoverArt artId={track.artId} title={track.album || track.title} size={56} />
      <button className="meta" aria-label={`Open player: ${track.title}, ${track.artist}`} onClick={() => setExpanded(true)}>
        <span className="ttl">{track.title}</span>
        <span className="show">{now.blocked ? "Tap play to start" : track.artist}</span>
      </button>
      {transport}
      {seekRow(true)}
      {modes}
      <button className="dock-toggle" aria-expanded={!collapsed} aria-label={collapsed ? "Expand player" : "Collapse player"} onClick={toggleCollapsed}>
        <ChevronDownIcon />
      </button>
      {expanded && (
        <Dialog label="Player" className="player-sheet" onClose={() => setExpanded(false)}>
          <button className="sheet-close" data-autofocus aria-label="Close player" onClick={() => setExpanded(false)}>
            <CloseIcon />
          </button>
          <CoverArt artId={track.artId} title={track.album || track.title} size={240} />
          <div className="sheet-title">{track.title}</div>
          {albumView ? (
            <button
              className="show-link"
              onClick={() => {
                setExpanded(false);
                onNavigate(albumView);
              }}
            >
              {track.artist} · {track.album}
            </button>
          ) : (
            <div className="muted">{track.artist}</div>
          )}
          {seekRow(false)}
          <div className="sheet-controls">
            {transport}
            {modes}
          </div>
          <button
            className="up-next"
            onClick={() => {
              setExpanded(false);
              onNavigate({ kind: "queue" });
            }}
          >
            {upNext ? `Up next: ${upNext.title}` : "Open the queue"}
          </button>
        </Dialog>
      )}
    </div>
  );
}
