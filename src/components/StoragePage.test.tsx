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
  delete (navigator as { storage?: unknown }).storage;
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

  // jsdom has no storage estimate, so the free space is whatever the quota says.
  function setQuota(quota: number) {
    const storage = { estimate: async () => ({ quota, usage: 0 }), persisted: async () => false, persist: async () => false };
    Object.defineProperty(navigator, "storage", { value: storage, configurable: true });
  }

  async function pick(...files: File[]) {
    const input = document.querySelector<HTMLInputElement>("input[type=file][multiple]")!;
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => void input.dispatchEvent(new Event("change", { bubbles: true })));
  }

  // Dialogs portal to the body, outside the page's host.
  const dialogTitle = () => document.querySelector(".dialog-head h2")?.textContent;
  const button = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === name);
  const jobLabel = async () => (await import("../lib/job")).getJob()?.label;

  it("shows the size of new songs and adds them once confirmed", async () => {
    setQuota(10_000);
    await render("add", 0);
    await pick(new File(["abc"], "new.mp3", { type: "audio/mpeg" }));
    await vi.waitFor(() => expect(dialogTitle()).toBe("Add 1 song?"));
    expect(document.activeElement).toBe(button("Add"));
    expect(await jobLabel()).toBeUndefined();
    await act(async () => button("Add")!.click());
    expect(dialogTitle()).toBeUndefined();
    expect(await jobLabel()).toBe("Adding songs");
  });

  it("warns when the songs won't fit, with Cancel first", async () => {
    setQuota(2);
    await render("add", 0);
    await pick(new File(["abc"], "new.mp3", { type: "audio/mpeg" }));
    await vi.waitFor(() => expect(dialogTitle()).toBe("Not enough space"));
    expect(button("Add what fits")).toBeDefined();
    expect(document.activeElement).toBe(button("Cancel"));
    await act(async () => button("Cancel")!.click());
    expect(dialogTitle()).toBeUndefined();
    expect(await jobLabel()).toBeUndefined();
  });

  it("adds a pick with no new songs without asking", async () => {
    setQuota(10_000);
    await render("add", 1);
    // Same name and size as the song already here.
    await pick(new File(["abc"], "s0.mp3", { type: "audio/mpeg" }));
    expect(await jobLabel()).toBe("Adding songs");
    expect(dialogTitle()).toBeUndefined();
  });
});
