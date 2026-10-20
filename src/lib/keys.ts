const FIELDS = "input, textarea, select, [contenteditable]";

interface Options {
  // Buttons and links already act on Space and Enter, so those keys are left to them.
  skipControls?: boolean;
  // The expanded player is a dialog, and the playback keys should still work in it.
  allowInPlayerSheet?: boolean;
}

export function isShortcut(e: KeyboardEvent, { skipControls = false, allowInPlayerSheet = false }: Options = {}): boolean {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return false;
  if (document.querySelector(allowInPlayerSheet ? ".dialog:not(.player-sheet)" : ".dialog")) return false;
  const target = e.target instanceof Element ? e.target : null;
  const activates = e.key === " " || e.key === "Enter";
  return !target?.closest(skipControls && activates ? `${FIELDS}, button, a` : FIELDS);
}
