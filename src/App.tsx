import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AddMusic } from "./components/AddMusic";
import { AlbumPage, Albums } from "./components/Albums";
import { Home } from "./components/Home";
import { ArtistPage, Artists } from "./components/Artists";
import { BrandMark, MenuIcon, RefreshIcon, UndoIcon } from "./components/icons";
import { OpenedFiles } from "./components/OpenedFiles";
import { Player } from "./components/Player";
import { LikedPage, PlaylistPage, Playlists } from "./components/Playlists";
import { Queue } from "./components/Queue";
import { Review } from "./components/Review";
import { Shortcuts } from "./components/Shortcuts";
import { Sidebar, type View } from "./components/Sidebar";
import { SongMenu, type MenuTarget } from "./components/SongMenu";
import { Songs } from "./components/Songs";
import { StoragePage } from "./components/StoragePage";
import { Button } from "./components/ui";
import { useAnnouncement } from "./lib/announce";
import { useJob } from "./lib/job";
import { isShortcut } from "./lib/keys";
import { hasOrigin, launchView, onViewPop, pushView, replaceView, startHistory, viewHash } from "./lib/history";
import { artistKey, getTracks, hasAlbum, hasArtist, hasFavourites, onStorageError, trackAlbumKey, useAlbums, useArtists, useLibraryLoaded, useLoadError, usePlaylists, useTrackMap } from "./lib/library";
import { useNowPlaying } from "./lib/player";
import { applyUpdate, useReloadPending, useUpdateReady } from "./lib/pwa";
import type { Track } from "./lib/types";
import { useMediaQuery } from "./lib/useMediaQuery";

const TOAST_MS = 8000;

interface Toast {
  message: string;
  action?: { label: string; icon?: ReactNode; run: () => void };
}

export default function App() {
  const loaded = useLibraryLoaded();
  const loadError = useLoadError();
  const byId = useTrackMap();
  const albums = useAlbums();
  const artists = useArtists();
  const playlists = usePlaylists();
  const now = useNowPlaying();
  // Decided once at launch, so the first import doesn't move the page away from its own progress.
  const [initialView] = useState<View>(() => launchView(getTracks().length === 0, hasFavourites()));
  const [view, setView] = useState(initialView);
  const [navOpen, setNavOpen] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const updateReady = useUpdateReady();
  const announcement = useAnnouncement();
  const reloadPending = useReloadPending();
  const busy = useJob()?.running ?? false;
  const main = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigated = useRef(false);
  // Set when the page's address changes because its album or artist was renamed, which isn't a new page.
  const followed = useRef(false);
  const drawer = useMediaQuery("(max-width: 959px)");
  const nowTrack = now.id ? byId.get(now.id) : undefined;
  // A song the player asked the list to land on; cleared once the list has scrolled to it.
  const [focusTrack, setFocusTrack] = useState<string | null>(null);
  const pendingFocus = useRef(false);


  useEffect(() => {
    if (followed.current) {
      followed.current = false;
      return;
    }
    // A jump to the current song scrolls itself, so the top-of-page reset would undo it. Consumed here,
    // since the list clears the focus request during its own layout pass, before this effect runs.
    const jumped = pendingFocus.current;
    pendingFocus.current = false;
    if (!jumped) main.current?.scrollTo(0, 0);
    // Moving focus to the heading announces the new view; the first render keeps the browser default.
    if (navigated.current) main.current?.querySelector("h1")?.focus({ preventScroll: true });
  }, [view]);

  useEffect(() => {
    startHistory(initialView);
    return onViewPop((next) => {
      navigated.current = true;
      setView((prev) => (viewHash(prev) === viewHash(next) ? prev : next));
    });
  }, [initialView]);

  useEffect(() => onStorageError((message) => setToast({ message })), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "?" && e.key !== "/") || !isShortcut(e)) return;
      if (e.key === "?") return setShortcutsOpen(true);
      const search = main.current?.querySelector<HTMLInputElement>('input[type="search"]');
      // The open nav drawer makes the page inert, so its search can't take focus.
      if (!search || search.closest("[inert]")) return;
      // Stops the slash being typed into the field, and Firefox's quick find.
      e.preventDefault();
      search.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const page = main.current;
    const app = page?.closest(".app");
    if (!page || !app) return;
    const root = document.documentElement.style;
    // Measured from the page's foot, so it covers whichever fills the row below: the player, the selection bar or nothing.
    const observer = new ResizeObserver(() =>
      root.setProperty("--dock-h", `${app.getBoundingClientRect().bottom - page.getBoundingClientRect().bottom}px`),
    );
    observer.observe(page);
    return () => {
      observer.disconnect();
      root.removeProperty("--dock-h");
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // iOS leaves the page panned up after the keyboard closes, pushing the dock off screen.
    const reset = () => {
      if (vv.height >= window.innerHeight - 1 && (window.scrollY || vv.offsetTop)) window.scrollTo(0, 0);
    };
    vv.addEventListener("resize", reset);
    vv.addEventListener("scroll", reset);
    return () => {
      vv.removeEventListener("resize", reset);
      vv.removeEventListener("scroll", reset);
    };
  }, []);

  const titleFor = (v: View): string =>
    v.kind === "album"
      ? (albums.find((a) => a.key === v.key)?.title ?? "Album")
      : v.kind === "artist"
        ? (artists.find((a) => a.key === v.key)?.name ?? "Artist")
        : v.kind === "playlist"
          ? (playlists.find((p) => p.id === v.id)?.name ?? "Playlist")
          : { home: "Home", songs: "Songs", albums: "Albums", artists: "Artists", playlists: "Playlists", liked: "Liked songs", queue: "Queue", review: "Review", add: "Add music", storage: "Storage" }[v.kind];
  const pageTitle = titleFor(view);
  const nowPlayingTitle = now.playing ? nowTrack?.title : undefined;

  useEffect(() => {
    document.title = nowPlayingTitle ? `▶ ${nowPlayingTitle} · TuneNook` : `${pageTitle} · TuneNook`;
  }, [pageTitle, nowPlayingTitle]);

  // The new service worker has taken over; reload once nothing is playing or importing, so neither is cut off.
  useEffect(() => {
    if (reloadPending && !now.playing && !busy) location.reload();
  }, [reloadPending, now.playing, busy]);

  const closeNav = useCallback(() => {
    // The menu button is inert while the drawer is open, so un-inert it before focusing.
    flushSync(() => setNavOpen(false));
    menuButton.current?.focus();
  }, []);

  const navigate = useCallback((target: View) => {
    navigated.current = true;
    // An origin keeps only its key or id, so origins don't chain.
    const origin: View = hasOrigin(view) ? { ...view, from: undefined } : view;
    const next: View = hasOrigin(target) && !target.from ? { ...target, from: origin } : target;
    pushView(next);
    setView(next);
    setNavOpen(false);
  }, [view]);

  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast({ message, action: undo && { label: "Undo", icon: <UndoIcon />, run: undo } });
  }, []);

  // The player's "Show in library": land on the playing row in the list, or the queue for a song that isn't saved.
  const showCurrent = useCallback(() => {
    if (!nowTrack) return;
    if (nowTrack.source.kind === "session") {
      navigate({ kind: "queue" });
      return;
    }
    pendingFocus.current = true;
    setFocusTrack(nowTrack.id);
    navigate({ kind: "songs" });
  }, [nowTrack, navigate]);

  const clearFocus = useCallback(() => setFocusTrack(null), []);

  const follow = useCallback((next: View) => {
    followed.current = true;
    replaceView(next);
    setView(next);
  }, []);

  // An edit can empty the album or artist page it was made from; the page then follows the song.
  const followEdit = useCallback((before: Track, after: Track) => {
    if (view.kind === "album" && view.key === trackAlbumKey(before) && !hasAlbum(view.key)) {
      follow({ ...view, key: trackAlbumKey(after) });
    } else if (view.kind === "artist" && !hasArtist(view.key)) {
      const key = [after.albumArtist, after.artist].map(artistKey).find(hasArtist);
      if (key) follow({ kind: "artist", key, from: view.from });
    }
  }, [view, follow]);

  const openMenu = useCallback((track: Track, context: MenuTarget["context"]) => setMenu({ track, context }), []);

  const covered = navOpen && drawer;
  const notice: Toast | null =
    toast ??
    (updateReady && !now.playing && !busy
      ? { message: "TuneNook has an update.", action: { label: "Reload", icon: <RefreshIcon />, run: applyUpdate } }
      : null);

  return (
    <div className={`app xh${navOpen ? " nav-open" : ""}`}>
      <div className="skip-links" inert={covered}>
        <a
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            main.current?.focus();
          }}
        >
          Skip to content
        </a>
        {nowTrack && (
          <a
            href="#player"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector<HTMLElement>(".player-dock .xh-play")?.focus();
            }}
          >
            Skip to player
          </a>
        )}
      </div>
      <header className="topbar" inert={covered}>
        <button
          ref={menuButton}
          className="menu-btn"
          aria-label="Open menu"
          aria-expanded={navOpen}
          aria-controls="sidebar"
          onClick={() => setNavOpen(true)}
        >
          <MenuIcon />
        </button>
        <div className="brand">
          <BrandMark className="brand-mark" />
          <span>TuneNook</span>
        </div>
      </header>

      <Sidebar
        view={view}
        onNavigate={navigate}
        drawer={drawer}
        open={navOpen}
        onClose={closeNav}
        onShortcuts={() => setShortcutsOpen(true)}
      />
      <button className="scrim" aria-hidden="true" tabIndex={-1} onClick={closeNav} />

      <main id="main" className="main" ref={main} tabIndex={-1} inert={covered}>
        {loadError ? (
          <section aria-labelledby="storage-title">
            <div className="empty">
              <h2 id="storage-title" className="h3">
                TuneNook can't open its storage
              </h2>
              <p className="muted">{loadError}</p>
              <p className="muted">
                Private browsing and blocked site data stop it from saving music. Check those settings, then reload.
              </p>
              <div className="head-actions">
                <Button onClick={() => location.reload()}>Reload</Button>
              </div>
            </div>
          </section>
        ) : !loaded ? (
          <section aria-label="Opening your library">
            <p className="muted">Opening your library…</p>
          </section>
        ) : view.kind === "home" ? (
          <Home
            onOpenAlbum={(key) => navigate({ kind: "album", key })}
            onOpenPlaylist={(id) => navigate({ kind: "playlist", id })}
            onBrowse={() => navigate({ kind: "albums" })}
          />
        ) : view.kind === "songs" ? (
          <Songs
            onMore={(t) => openMenu(t, { kind: "library" })}
            onAdd={() => navigate({ kind: "add" })}
            onToast={showToast}
            focusId={focusTrack}
            onFocused={clearFocus}
          />
        ) : view.kind === "albums" ? (
          <Albums onOpen={(key) => navigate({ kind: "album", key })} onAdd={() => navigate({ kind: "add" })} />
        ) : view.kind === "album" ? (
          <AlbumPage
            key={view.key}
            albumKey={view.key}
            backLabel={view.from ? titleFor(view.from) : "Albums"}
            // The origin's entry sits right behind this one, so Back keeps history linear.
            onBack={() => (view.from ? history.back() : navigate({ kind: "albums" }))}
            onMore={(t) => openMenu(t, { kind: "library" })}
            onRenamed={(key) => follow({ ...view, key })}
            onToast={showToast}
          />
        ) : view.kind === "artists" ? (
          <Artists onOpen={(key) => navigate({ kind: "artist", key })} onAdd={() => navigate({ kind: "add" })} />
        ) : view.kind === "artist" ? (
          <ArtistPage
            key={view.key}
            artistKey={view.key}
            backLabel={view.from ? titleFor(view.from) : "Artists"}
            // The origin's entry sits right behind this one, so Back keeps history linear.
            onBack={() => (view.from ? history.back() : navigate({ kind: "artists" }))}
            onOpenAlbum={(key) => navigate({ kind: "album", key })}
            onMore={(t) => openMenu(t, { kind: "library" })}
            onToast={showToast}
          />
        ) : view.kind === "playlists" ? (
          <Playlists onOpen={(id) => navigate({ kind: "playlist", id })} onOpenLiked={() => navigate({ kind: "liked" })} />
        ) : view.kind === "liked" ? (
          <LikedPage onBack={() => navigate({ kind: "playlists" })} onMore={(t) => openMenu(t, { kind: "library" })} onToast={showToast} />
        ) : view.kind === "playlist" ? (
          <PlaylistPage
            key={view.id}
            id={view.id}
            backLabel={view.from ? titleFor(view.from) : "Playlists"}
            // The origin's entry sits right behind this one, so Back keeps history linear.
            onBack={() => (view.from ? history.back() : navigate({ kind: "playlists" }))}
            onMore={(t, index, row) => openMenu(t, { kind: "playlist", playlistId: view.id, index, row })}
            onToast={showToast}
          />
        ) : view.kind === "queue" ? (
          <Queue onMore={(t, pos) => openMenu(t, { kind: "queue", pos })} onToast={showToast} />
        ) : view.kind === "review" ? (
          <Review
            onMore={(t) => openMenu(t, { kind: "library" })}
            onOpenArtist={(key) => navigate({ kind: "artist", key })}
            onOpenAlbum={(key) => navigate({ kind: "album", key })}
          />
        ) : view.kind === "storage" ? (
          <StoragePage
            onOpenAlbum={(key) => navigate({ kind: "album", key })}
            onMore={(t) => openMenu(t, { kind: "library" })}
          />
        ) : (
          <AddMusic />
        )}
      </main>

      <div className="sr-only" role="status">
        {announcement}
      </div>
      <div className="toast-host" role="status">
        {notice && (
          <div className="toast">
            <span>{notice.message}</span>
            {notice.action && (
              <Button
                variant="secondary"
                small
                icon={notice.action.icon}
                onClick={() => {
                  notice.action?.run();
                  setToast(null);
                }}
              >
                {notice.action.label}
              </Button>
            )}
          </div>
        )}
      </div>
      {menu && <SongMenu target={menu} onClose={() => setMenu(null)} onNavigate={navigate} onEdited={followEdit} onToast={showToast} />}
      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}
      <OpenedFiles onAdding={() => navigate({ kind: "add" })} />

      {nowTrack && (
        <div className="player-dock" id="player">
          <Player onNavigate={navigate} onShowCurrent={showCurrent} />
        </div>
      )}
    </div>
  );
}
