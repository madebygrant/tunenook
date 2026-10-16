import { useEffect, useRef, type RefObject } from "react";
import type { View } from "../components/Sidebar";

const SONGS: View = { kind: "songs" };
const PLAIN_KINDS = new Set<string>(["songs", "albums", "artists", "playlists", "liked", "queue", "add"] satisfies View["kind"][]);

export function viewHash(view: View): string {
  if (view.kind === "album" || view.kind === "artist") return `#/${view.kind}/${encodeURIComponent(view.key)}`;
  if (view.kind === "playlist") return `#/playlist/${encodeURIComponent(view.id)}`;
  return `#/${view.kind}`;
}

export function viewFromHash(hash: string): View | null {
  const match = /^#\/([a-z]+)(?:\/(.+))?$/.exec(hash);
  if (!match) return null;
  const [, kind, arg] = match;
  if (arg === undefined) return PLAIN_KINDS.has(kind) ? ({ kind } as View) : null;
  let value: string;
  try {
    value = decodeURIComponent(arg);
  } catch {
    return null;
  }
  if (kind === "album" || kind === "artist") return { kind, key: value };
  if (kind === "playlist") return { kind, id: value };
  return null;
}

// An album remembers the view it was opened from, so its back button can return there.
function entryState(view: View): { from: string } | null {
  return view.kind === "album" && view.from ? { from: viewHash(view.from) } : null;
}

export function currentView(): View | null {
  const view = viewFromHash(location.hash);
  const from = (history.state as { from?: unknown } | null)?.from;
  const origin = typeof from === "string" ? viewFromHash(from) : null;
  return view?.kind === "album" && origin ? { ...view, from: origin } : view;
}

// Each open sheet owns a same-URL history entry, so Back closes it.
function layerDepth(): number {
  const layer = (history.state as { layer?: unknown } | null)?.layer;
  return typeof layer === "number" ? layer : 0;
}

interface Layer {
  close: () => void;
}

const open: Layer[] = [];
const viewListeners = new Set<(view: View) => void>();
let traversing = false;
let waiting: (() => void)[] = [];
let syncQueued = false;
let listening = false;
let started = false;

function listen(): void {
  if (listening) return;
  window.addEventListener("popstate", onPop);
  listening = true;
}

// history.go is async, so history.state is stale until our own step lands.
function whenSettled(action: () => void): void {
  if (traversing) waiting.push(action);
  else action();
}

function goBack(steps: number): void {
  traversing = true;
  history.go(-steps);
}

function sync(): void {
  const depth = layerDepth();
  if (open.length < depth) goBack(depth - open.length);
  else for (let d = depth + 1; d <= open.length; d++) history.pushState({ layer: d }, "");
}

// Deferred, so StrictMode's remount adds one entry and a sheet that navigates as it closes is seen after pushView.
function queueSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    whenSettled(sync);
  });
}

function onPop(): void {
  if (traversing) {
    traversing = false;
    const actions = waiting;
    waiting = [];
    actions.forEach(whenSettled);
    return;
  }
  // Removed first, so a sheet that ignores onClose isn't given a new entry.
  open
    .splice(layerDepth())
    .reverse()
    .forEach((layer) => layer.close());
  const view = currentView();
  if (!view) history.replaceState(history.state, "", viewHash(SONGS));
  viewListeners.forEach((listener) => listener(view ?? SONGS));
  // Forward onto the entry of a sheet that has since closed steps straight back off it.
  queueSync();
}

// A reload can land on a sheet's entry with no sheet open.
export function startHistory(view: View): void {
  if (started) return;
  started = true;
  listen();
  const depth = layerDepth();
  if (depth > 0) goBack(depth);
  whenSettled(() => history.replaceState(entryState(view), "", viewHash(view)));
}

// Back and Forward between views; steps this module takes to close sheets aren't reported.
export function onViewPop(listener: (view: View) => void): () => void {
  listen();
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
}

// Navigating from a sheet first drops the sheet entries, so Back returns to the page behind them.
export function pushView(view: View): void {
  whenSettled(() => {
    const depth = layerDepth();
    if (depth > 0) goBack(depth);
    whenSettled(() => {
      const hash = viewHash(view);
      if (location.hash !== hash) history.pushState(entryState(view), "", hash);
    });
  });
}

export function openLayer(layer: Layer): () => void {
  listen();
  open.push(layer);
  queueSync();
  return () => {
    const at = open.indexOf(layer);
    if (at >= 0) open.splice(at, 1);
    queueSync();
  };
}

// Returns the latest onClose, for callers that also close on their own keys.
export function useCloseOnBack(onClose: () => void, active = true): RefObject<() => void> {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!active) return;
    return openLayer({ close: () => close.current() });
  }, [active]);
  return close;
}
