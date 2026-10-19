import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freshEnvironment } from "../lib/testing";

let root: Root | null = null;

beforeEach(() => {
  freshEnvironment();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

async function renderNested() {
  const { Dialog } = await import("./Dialog");
  function Page() {
    const [outer, setOuter] = useState(true);
    const [inner, setInner] = useState(false);
    return (
      <div className="app">
        {outer && (
          <Dialog label="Player" onClose={() => setOuter(false)}>
            <button onClick={() => setInner(true)}>Sleep timer</button>
            {inner && (
              <Dialog label="Sleep timer" onClose={() => setInner(false)}>
                <button>15 minutes</button>
              </Dialog>
            )}
          </Dialog>
        )}
      </div>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Page />));
  // Opened from inside the first, as the sleep timer opens from the player.
  act(() => document.querySelector<HTMLButtonElement>("[aria-label=Player] button")!.click());
}

const dialogs = () => [...document.querySelectorAll("[role=dialog]")].map((d) => d.getAttribute("aria-label"));
const layerOf = (label: string) => document.querySelector(`[aria-label="${label}"]`)!.parentElement!;
const app = () => document.querySelector<HTMLElement>(".app")!;
const escape = () => act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

describe("a dialog opened over another", () => {
  it("is the only one Escape closes, and keeps everything under it inert until the last one closes", async () => {
    await renderNested();
    expect(dialogs()).toEqual(["Player", "Sleep timer"]);
    expect(app().inert).toBe(true);
    expect(layerOf("Player").hasAttribute("inert")).toBe(true);

    escape();
    expect(dialogs()).toEqual(["Player"]);
    expect(app().inert).toBe(true);
    expect(layerOf("Player").hasAttribute("inert")).toBe(false);

    escape();
    expect(dialogs()).toEqual([]);
    expect(app().inert).toBe(false);
  });
});
