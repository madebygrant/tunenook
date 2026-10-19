import { useEffect, useRef, type ReactNode } from "react";
import { useCloseOnBack } from "../lib/history";
import { AddMusicIcon, AlbumIcon, ArtistIcon, BrandMark, CloseIcon, PlaylistIcon, QueueIcon, ReviewIcon, SongsIcon } from "./icons";

export type View =
  | { kind: "songs" }
  | { kind: "albums" }
  | { kind: "album"; key: string; from?: View }
  | { kind: "artists" }
  | { kind: "artist"; key: string; from?: View }
  | { kind: "playlists" }
  | { kind: "playlist"; id: string }
  | { kind: "liked" }
  | { kind: "queue" }
  | { kind: "review" }
  | { kind: "add" };

interface Props {
  view: View;
  onNavigate: (view: View) => void;
  drawer: boolean;
  open: boolean;
  onClose: () => void;
  onShortcuts: () => void;
}

const FOCUSABLE = "button:not([disabled]), a[href]";
const DOCK_FOCUSABLE = ".player-dock button:not([disabled]), .player-dock a[href]";

const ITEMS: { kind: View["kind"]; label: string; icon: ReactNode; also?: View["kind"][] }[] = [
  { kind: "songs", label: "Songs", icon: <SongsIcon /> },
  { kind: "albums", label: "Albums", icon: <AlbumIcon />, also: ["album"] },
  { kind: "artists", label: "Artists", icon: <ArtistIcon />, also: ["artist"] },
  { kind: "playlists", label: "Playlists", icon: <PlaylistIcon />, also: ["playlist", "liked"] },
  { kind: "queue", label: "Queue", icon: <QueueIcon /> },
  { kind: "review", label: "Review", icon: <ReviewIcon /> },
  { kind: "add", label: "Add music", icon: <AddMusicIcon /> },
];

export function Sidebar({ view, onNavigate, drawer, open, onClose, onShortcuts }: Props) {
  const nav = useRef<HTMLElement>(null);
  const modal = drawer && open;
  useCloseOnBack(onClose, modal);

  useEffect(() => {
    if (!modal) return;
    nav.current?.querySelector<HTMLElement>(".nav-close")?.focus();
    const onKey = (e: KeyboardEvent) => {
      // A sheet opened from the drawer handles its own Escape.
      if (e.key === "Escape") return document.querySelector(".dialog") ? undefined : onClose();
      if (e.key !== "Tab" || !nav.current) return;
      // The player dock stays usable with the drawer open, so it is part of the trap.
      const dock = document.querySelectorAll<HTMLElement>(DOCK_FOCUSABLE);
      const items = [...nav.current.querySelectorAll<HTMLElement>(FOCUSABLE), ...dock];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, onClose]);

  return (
    <nav className="xh-nav" id="sidebar" ref={nav} aria-label="Primary">
      <div className="brand">
        <BrandMark className="brand-mark" />
        <span>TuneNook</span>
        <button className="nav-close" aria-label="Close menu" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {ITEMS.map(({ kind, label, icon, also }) => {
        const active = view.kind === kind || also?.includes(view.kind) === true;
        return (
          <button
            key={kind}
            className={`nav-item${active ? " is-active" : ""}`}
            aria-current={view.kind === kind ? "page" : undefined}
            onClick={() => onNavigate({ kind } as View)}
          >
            {icon}
            <span>{label}</span>
          </button>
        );
      })}
      <div className="nav-foot">
        <button type="button" className="shortcuts-link" onClick={onShortcuts}>
          Keyboard shortcuts <kbd>?</kbd>
        </button>
      </div>
    </nav>
  );
}
