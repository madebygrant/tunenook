import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshEnvironment, makeTrack } from "../lib/testing";

let root: Root | null = null;

beforeEach(() => {
  freshEnvironment();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  delete (navigator as { canShare?: unknown }).canShare;
  delete (navigator as { share?: unknown }).share;
});

async function render(ids: string[]) {
  const library = await import("../lib/library");
  const { ExportSongs } = await import("./ExportSongs");
  await library.loadLibrary();
  await library.addTrack({ track: makeTrack("a"), file: new Blob(["a"]) });
  await library.addTrack({ track: makeTrack("l", { source: { kind: "linked", folderId: "f", path: "l.mp3" } }) });
  vi.spyOn(library, "storedFile").mockImplementation(async (id) => (id === "a" ? new Blob(["audio"]) : undefined));
  const onDone = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<ExportSongs ids={ids} onDone={onDone} />));
  await vi.waitFor(() => expect(host.textContent).toContain("ready to export"));
  const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  return { host, button, onDone };
}

describe("ExportSongs", () => {
  it("says which songs are left out, and offers Download where the browser can't share or pick a folder", async () => {
    const { host, button } = await render(["a", "l"]);
    expect(host.textContent).toContain("1 song from a linked folder isn't included");
    expect(button("Share")).toBeUndefined();
    expect(button("Download")).toBeDefined();
  });

  it("offers Share where the browser can share the files, and says sharing failed when it does", async () => {
    Object.assign(navigator, { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException("too big", "DataError")) });
    const { host, button, onDone } = await render(["a"]);
    await act(async () => button("Share")!.click());
    expect(host.querySelector("[role=alert]")?.textContent).toContain("Couldn't share these songs");
    expect(onDone).not.toHaveBeenCalled();
  });
});
