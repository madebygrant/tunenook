import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnvironment, makeTrack } from "../lib/testing";

// The service worker module only exists in a Vite build.
vi.mock("../lib/pwa", () => ({ useCanInstall: () => false, promptInstall: () => {} }));

let root: Root | null = null;

beforeEach(() => {
  freshEnvironment();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no matchMedia; the pages ask whether TuneNook runs installed.
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  delete (window as { matchMedia?: unknown }).matchMedia;
});

async function render(page: "storage" | "add", songs: number) {
  const library = await import("../lib/library");
  const { StoragePage } = await import("./StoragePage");
  const { AddMusic } = await import("./AddMusic");
  await library.loadLibrary();
  for (let i = 0; i < songs; i++) await library.addTrack({ track: makeTrack(`s${i}`), file: new Blob(["a"]) });
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(page === "storage" ? <StoragePage onOpenAlbum={() => {}} onMore={() => {}} /> : <AddMusic />));
  const headings = () => [...host.querySelectorAll("h2")].map((h) => h.textContent);
  return { headings };
}

describe("StoragePage", () => {
  it("holds Back up and what's using space once there are songs", async () => {
    const { headings } = await render("storage", 1);
    await vi.waitFor(() => expect(headings()).toEqual(expect.arrayContaining(["Back up", "What's using space"])));
  });

  it("leaves out Back up and the usage chart when the library is empty", async () => {
    const { headings } = await render("storage", 0);
    await act(async () => {});
    expect(headings()).not.toContain("Back up");
    expect(headings()).not.toContain("What's using space");
  });
});

describe("AddMusic", () => {
  it("only offers ways to add songs, with backup and storage on their own page", async () => {
    const { headings } = await render("add", 1);
    await vi.waitFor(() => expect(headings()).toContain("Copy songs into TuneNook"));
    expect(headings()).not.toContain("Back up");
    expect(headings()).not.toContain("On this device");
  });
});
