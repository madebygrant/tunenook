import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freshEnvironment, makeTrack } from "../lib/testing";

let root: Root | null = null;

beforeEach(() => {
  freshEnvironment();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function menuLabels(ids: string[]): Promise<string[]> {
  const library = await import("../lib/library");
  const { CollectionMenu } = await import("./SongMenu");
  await library.loadLibrary();
  await library.addTrack({ track: makeTrack("a"), file: new Blob(["a"]) });
  const extraItems = [
    { label: "Rename…", group: "playlist", run: () => {} },
    { label: "Delete playlist…", group: "delete", danger: true, run: () => {} },
  ];
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<CollectionMenu title="Mix" subtitle="" ids={ids} extraItems={extraItems} onClose={() => {}} onToast={() => {}} />));
  return [...document.querySelectorAll(".menu-item")].map((b) => b.textContent ?? "");
}

describe("CollectionMenu", () => {
  it("shows only the collection's own items when it has no songs", async () => {
    expect(await menuLabels([])).toEqual(["Rename…", "Delete playlist…"]);
  });

  it("keeps the song items, Export songs included, ahead of the collection's own", async () => {
    expect(await menuLabels(["a"])).toEqual(["Play next", "Add to queue", "Add to playlist…", "Export songs…", "Rename…", "Delete playlist…"]);
  });
});
