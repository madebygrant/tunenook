import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTrack } from "../lib/testing";
import { useSelection } from "../lib/useSelection";
import { ListBar } from "./Selection";

let root: Root | null = null;
const tracks = [makeTrack("a"), makeTrack("b")];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function Page() {
  const selection = useSelection(tracks);
  return <ListBar selection={selection} tracks={tracks} removal={{ kind: "custom", label: "Remove from playlist", short: "Remove", run: vi.fn() }} onToast={vi.fn()} />;
}

function render() {
  const app = document.createElement("div");
  app.className = "app";
  const page = document.createElement("main");
  app.append(page);
  document.body.append(app);
  root = createRoot(page);
  act(() => root!.render(<Page />));
  const button = (label: string) => [...app.querySelectorAll("button")].find((b) => b.textContent === label);
  return { app, page, button };
}

describe("SelectionBar", () => {
  it("takes the dock's place in the app, outside the page, with focus on its first control", () => {
    const { app, page, button } = render();
    act(() => button("Select")!.click());
    const dock = app.querySelector(".selection-dock");
    expect(dock?.parentElement).toBe(app);
    expect(page.contains(dock)).toBe(false);
    expect(document.activeElement).toBe(button("Select all"));
  });

  it("shows the short removal label, keeps the full one for screen readers, and waits for a song", () => {
    const { app, button } = render();
    act(() => button("Select")!.click());
    const remove = app.querySelector<HTMLButtonElement>(".selection-action.remove")!;
    expect(remove.textContent).toBe("Remove");
    expect(remove.getAttribute("aria-label")).toBe("Remove from playlist");
    expect(remove.disabled).toBe(true);
  });

  it("hands focus back to Select when it closes", () => {
    const { app, button } = render();
    act(() => button("Select")!.click());
    act(() => button("Done")!.click());
    expect(app.querySelector(".selection-dock")).toBeNull();
    expect(document.activeElement).toBe(button("Select"));
  });
});
