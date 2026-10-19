import { useState } from "react";
import { promptInstall, useCanInstall } from "../lib/pwa";
import { canAddToHomeScreen, useStandalone } from "../lib/standalone";
import { CloseIcon } from "./icons";
import { Button } from "./ui";

const DISMISSED_KEY = "tunenook.installHintDismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallHint() {
  const standalone = useStandalone();
  const canPrompt = useCanInstall();
  const [homeScreen] = useState(() => canAddToHomeScreen());
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (standalone || dismissed || !(homeScreen || canPrompt)) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage blocked: hidden until reload.
    }
    setDismissed(true);
  }

  return (
    <aside className="xh-panel install-hint" aria-label="Install TuneNook">
      {homeScreen ? (
        <p>
          Add TuneNook to your Home Screen from the Share menu (it may be under ···) before adding music. The installed app
          has its own storage, so songs added here in the browser won't be there, and iOS keeps an installed app's storage.
        </p>
      ) : (
        <div className="install-prompt">
          <p>Install TuneNook so the browser keeps your music when the device runs low on space, and it opens like an app.</p>
          <Button variant="secondary" small onClick={() => void promptInstall()}>
            Install
          </Button>
        </div>
      )}
      <Button variant="ghost" small icon={<CloseIcon />} aria-label="Dismiss" onClick={dismiss} />
    </aside>
  );
}
