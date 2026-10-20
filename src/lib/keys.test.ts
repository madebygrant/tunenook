import { afterEach, describe, expect, it } from "vitest";
import { isShortcut } from "./keys";

function press(target: Element, init: KeyboardEventInit = {}): KeyboardEvent {
  let seen: KeyboardEvent | null = null;
  const listener = (e: Event) => (seen = e as KeyboardEvent);
  window.addEventListener("keydown", listener);
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true, ...init }));
  window.removeEventListener("keydown", listener);
  return seen!;
}

function add(html: string): Element {
  const box = document.createElement("div");
  box.innerHTML = html;
  document.body.append(box);
  return box.firstElementChild!;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isShortcut", () => {
  it("accepts a plain key on the page and rejects modifiers and fields", () => {
    expect(isShortcut(press(document.body))).toBe(true);
    expect(isShortcut(press(document.body, { ctrlKey: true }))).toBe(false);
    expect(isShortcut(press(document.body, { metaKey: true }))).toBe(false);
    expect(isShortcut(press(add("<input>")))).toBe(false);
    expect(isShortcut(press(add('<div contenteditable="true"></div>')))).toBe(false);
  });

  it("leaves Space and Enter to a focused button only when asked", () => {
    const button = add("<button>Play</button>");
    expect(isShortcut(press(button, { key: " " }))).toBe(true);
    expect(isShortcut(press(button, { key: " " }), { skipControls: true })).toBe(false);
    expect(isShortcut(press(button, { key: "Enter" }), { skipControls: true })).toBe(false);
    expect(isShortcut(press(button), { skipControls: true })).toBe(true);
  });

  it("rejects keys while a dialog is open, except the player sheet when allowed", () => {
    const sheet = add('<div class="dialog player-sheet"></div>');
    expect(isShortcut(press(document.body))).toBe(false);
    expect(isShortcut(press(document.body), { allowInPlayerSheet: true })).toBe(true);
    sheet.className = "dialog song-menu";
    expect(isShortcut(press(document.body), { allowInPlayerSheet: true })).toBe(false);
  });
});
