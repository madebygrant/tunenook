import { Dialog } from "./Dialog";
import { CloseIcon } from "./icons";

const SHORTCUTS: [string, string][] = [
  ["Space", "Play or pause"],
  ["←", "Back 10 seconds"],
  ["→", "Forward 10 seconds"],
  ["N", "Next song"],
  ["P", "Previous song"],
  ["S", "Shuffle on or off"],
  ["R", "Repeat off, all or one"],
  ["M", "Mute or unmute"],
  ["/", "Search songs or albums"],
  ["?", "Show this list"],
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <Dialog label="Keyboard shortcuts" className="shortcuts" onClose={onClose}>
      <div className="dialog-head">
        <h2 className="h3">Keyboard shortcuts</h2>
        <button className="sheet-close" data-autofocus aria-label="Close shortcuts" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <dl>
        {SHORTCUTS.map(([key, action]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
