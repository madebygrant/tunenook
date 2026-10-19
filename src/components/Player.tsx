import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { requestAccess } from "../lib/folders";
import { formatClock } from "../lib/format";
import { artistPageFor, hasAlbum, toggleLike, trackAlbumKey, useTrackMap } from "../lib/library";
import {
  canPickOutput,
  cycleRepeat,
  getNowPlaying,
  hasNext,
  lastSleepChoice,
  next,
  nextIsSameAlbum,
  pickOutput,
  previous,
  retry,
  seek,
  seekBy,
  SEEK_SECONDS,
  setSleepTimer,
  setVolume,
  toggle,
  toggleMute,
  toggleShuffle,
  useDuration,
  useMuted,
  useNowPlaying,
  usePosition,
  useQueue,
  useSleepTimer,
  useVolume,
  useWirelessOutput,
  type SleepChoice,
} from "../lib/player";
import { isIOS } from "../lib/standalone";
import { isShortcut } from "../lib/keys";
import { idAt } from "../lib/queue";
import { Dialog } from "./Dialog";
import { ChevronDownIcon, HeartIcon, MoonIcon, MutedIcon, NextIcon, OutputIcon, PauseIcon, PlayIcon, PrevIcon, RefreshIcon, RepeatIcon, RepeatOneIcon, ShuffleIcon, VolumeIcon } from "./icons";
import type { View } from "./Sidebar";
import { MenuSheet } from "./SongMenu";
import { Button, CoverArt } from "./ui";

const COLLAPSED_KEY = "tunenook.dockCollapsed";
const SLEEP_MINUTES = [15, 30, 45, 60, 90, 120];
// iOS makes audio.volume read-only; the hardware buttons are the only control.
const canSetVolume = !isIOS();

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function likeCurrent(): void {
  const id = getNowPlaying().id;
  if (id) void toggleLike(id);
}

// Whole seconds, so the snapshot only changes when the countdown would.
const nowSeconds = () => Math.floor(Date.now() / 1000);

function subscribeClock(onTick: () => void): () => void {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}

function Countdown({ endsAt }: { endsAt: number }) {
  const now = useSyncExternalStore(subscribeClock, nowSeconds);
  return <>Stops in {formatClock(Math.max(0, Math.ceil(endsAt / 1000) - now))}</>;
}

function OutputControl() {
  const elsewhere = useWirelessOutput();
  if (!canPickOutput()) return null;
  return (
    <button
      className={`sheet-quiet${elsewhere ? " is-set" : ""}`}
      aria-label={elsewhere ? "Playing on another device. Choose where it plays" : "Choose where it plays"}
      onClick={pickOutput}
    >
      <OutputIcon />
    </button>
  );
}

const sleepLabel = (minutes: number) => (minutes % 60 ? `${minutes} minutes` : minutes === 60 ? "1 hour" : `${minutes / 60} hours`);

// A quiet line in the player that opens the choices in their own sheet, so they never crowd the controls.
function SleepTimerControl() {
  const sleep = useSleepTimer();
  const [open, setOpen] = useState(false);
  // Read when the sheet opens, so it shows what was picked the night before.
  const last = open ? lastSleepChoice() : null;
  const album = open && (sleep?.kind === "album" || nextIsSameAlbum());
  const note = (choice: SleepChoice, on: boolean) =>
    on ? <span className="menu-note">On</span> : !sleep && last === choice && <span className="menu-note">Last time</span>;
  const choose = (choice: SleepChoice | null) => {
    setSleepTimer(choice);
    setOpen(false);
  };

  return (
    <>
      <button className={`sheet-quiet${sleep ? " is-set" : ""}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <MoonIcon />
        <span>
          {!sleep ? "Sleep timer" : sleep.kind === "song" ? "After this song" : sleep.kind === "album" ? "After this album" : <Countdown endsAt={sleep.endsAt} />}
        </span>
      </button>
      {open && (
        <MenuSheet label="Sleep timer" title="Sleep timer" subtitle="Stop playing after" onClose={() => setOpen(false)}>
          <ul className="menu-list">
            {SLEEP_MINUTES.map((minutes) => (
              <li key={minutes}>
                <button className="menu-item" onClick={() => choose(minutes)}>
                  {sleepLabel(minutes)}
                  {note(minutes, sleep?.kind === "at" && sleep.minutes === minutes)}
                </button>
              </li>
            ))}
            <li>
              <button className="menu-item" onClick={() => choose("song")}>
                End of this song
                {note("song", sleep?.kind === "song")}
              </button>
            </li>
            {album && (
              <li>
                <button className="menu-item" onClick={() => choose("album")}>
                  End of this album
                  {note("album", sleep?.kind === "album")}
                </button>
              </li>
            )}
            {sleep && (
              <>
                <li className="menu-gap" aria-hidden="true" />
                <li>
                  <button className="menu-item" onClick={() => choose(null)}>
                    Turn off
                  </button>
                </li>
              </>
            )}
          </ul>
        </MenuSheet>
      )}
    </>
  );
}

function VolumeControl({ muted }: { muted: boolean }) {
  const volume = useVolume();
  const shown = muted ? 0 : volume;
  // A volume of 0 counts as muted, so the button and M bring the sound back either way.
  const silent = shown === 0;
  return (
    <div className="volume">
      <button className="mode-btn" aria-pressed={silent} aria-label="Mute" title={`${silent ? "Unmute" : "Mute"} (M)`} onClick={toggleMute}>
        {silent ? <MutedIcon /> : <VolumeIcon />}
      </button>
      <input
        className="seek"
        type="range"
        aria-label="Volume"
        aria-valuetext={`${Math.round(shown * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        value={shown}
        style={{ "--pct": `${shown * 100}%` } as CSSProperties}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </div>
  );
}

export function Player({ onNavigate, onShowCurrent }: { onNavigate: (view: View) => void; onShowCurrent: () => void }) {
  const now = useNowPlaying();
  const queue = useQueue();
  const byId = useTrackMap();
  const time = usePosition();
  const duration = useDuration();
  const muted = useMuted();
  // Announced only on a change, so the dock appearing doesn't say "Unmuted".
  const [mutedNotice, setMutedNotice] = useState("");
  const [shownMuted, setShownMuted] = useState(muted);
  if (shownMuted !== muted) {
    setShownMuted(muted);
    setMutedNotice(muted ? "Muted" : "Unmuted");
  }
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const track = now.id ? byId.get(now.id) : undefined;
  const failure = now.failure;
  const canNext = hasNext(queue);
  const upNext = canNext ? byId.get(idAt(queue, (queue.at + 1) % queue.order.length)) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcut(e, { skipControls: true, allowInPlayerSheet: true })) return;
      const key = e.key.toLowerCase();
      // Held toggles would flip on every auto-repeat; seeking and skipping may repeat.
      const once = (action: () => void) => !e.repeat && action();
      if (e.code === "Space") once(toggle);
      else if (e.key === "ArrowLeft") seekBy(-SEEK_SECONDS);
      else if (e.key === "ArrowRight") seekBy(SEEK_SECONDS);
      else if (key === "n") next();
      else if (key === "p") previous();
      else if (key === "s") once(toggleShuffle);
      else if (key === "r") once(cycleRepeat);
      else if (key === "m") once(toggleMute);
      else if (key === "l") once(() => likeCurrent());
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
  const liked = track.likedAt !== undefined;
  // A song played without adding isn't saved, so there's nothing to keep a like on.
  const canLike = track.source.kind !== "session";
  const likeButton = canLike && (
    <button className="mode-btn" aria-pressed={liked} aria-label="Like" title={`${liked ? "Liked" : "Like"} (L)`} onClick={likeCurrent}>
      <HeartIcon filled={liked} />
    </button>
  );
  const shuffleButton = (
    <button
      className="mode-btn"
      aria-pressed={queue.shuffle}
      aria-label="Shuffle"
      title={`Shuffle ${queue.shuffle ? "on" : "off"} (S)`}
      onClick={toggleShuffle}
    >
      <ShuffleIcon />
    </button>
  );
  const repeatButton = (
    <button
      className="mode-btn"
      aria-pressed={queue.repeat !== "off"}
      aria-label={`${repeatLabel}. Change repeat`}
      title={`${repeatLabel} (R)`}
      onClick={cycleRepeat}
    >
      {queue.repeat === "one" ? <RepeatOneIcon /> : <RepeatIcon />}
    </button>
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

  const albumKeyOf = track.album ? trackAlbumKey(track) : null;
  // A song played without adding may be from an album that isn't in the library.
  const albumView: View | null = albumKeyOf && hasAlbum(albumKeyOf) ? { kind: "album", key: albumKeyOf } : null;
  const artistKey = artistPageFor(track);
  const artistView: View | null = artistKey ? { kind: "artist", key: artistKey } : null;
  const go = (view: View) => {
    setExpanded(false);
    onNavigate(view);
  };

  return (
    <div className={`xh-player${collapsed ? " is-collapsed" : ""}`} role="region" aria-label="Player">
      <CoverArt artId={track.artId} title={track.album || track.title} size={56} />
      <button
        className="meta"
        aria-label={`Open player: ${track.title}, ${track.artist}${muted ? ", muted" : ""}`}
        onClick={() => setExpanded(true)}
      >
        <span className="ttl">{track.title}</span>
        <span className="show">{now.blocked ? "Tap play to start" : muted ? `Muted · ${track.artist}` : track.artist}</span>
      </button>
      <span className="sr-only" role="status">
        {mutedNotice}
      </span>
      {transport}
      {seekRow(true)}
      <div className="modes">
        {shuffleButton}
        {repeatButton}
      </div>
      {canSetVolume && <VolumeControl muted={muted} />}
      <button className="dock-toggle" aria-expanded={!collapsed} aria-label={collapsed ? "Expand player" : "Collapse player"} onClick={toggleCollapsed}>
        <ChevronDownIcon />
      </button>
      {expanded && (
        <Dialog label="Player" className="player-sheet" swipeToClose onClose={() => setExpanded(false)}>
          <button className="sheet-dismiss" data-autofocus aria-label="Close player" onClick={() => setExpanded(false)}>
            <ChevronDownIcon />
          </button>
          <CoverArt artId={track.artId} title={track.album || track.title} size={320} />
          <div className="sheet-head">
            <div className="sheet-text">
              <button
                className="sheet-title"
                title={track.source.kind === "session" ? "Show in queue" : "Show in library"}
                aria-label={`${track.title}. ${track.source.kind === "session" ? "Show in queue" : "Show in library"}`}
                onClick={() => {
                  setExpanded(false);
                  onShowCurrent();
                }}
              >
                {track.title}
              </button>
              <div className="sheet-links">
                {artistView ? (
                  <button className="sheet-link" onClick={() => go(artistView)}>
                    {track.artist}
                  </button>
                ) : (
                  <span>{track.artist}</span>
                )}
                {albumView && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button className="sheet-link" onClick={() => go(albumView)}>
                      {track.album}
                    </button>
                  </>
                )}
              </div>
              {muted && <p className="muted">Muted. Press M to unmute.</p>}
            </div>
            {likeButton}
          </div>
          {seekRow(false)}
          <div className="sheet-transport">
            {shuffleButton}
            {transport}
            {repeatButton}
          </div>
          <div className="sheet-foot">
            <div className="sheet-tools">
              <SleepTimerControl />
              <OutputControl />
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
          </div>
        </Dialog>
      )}
    </div>
  );
}
