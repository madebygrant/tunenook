import { plural } from "../lib/format";
import { useJob } from "../lib/job";
import { addOpened, dismissOpened, playOpened, useOpened } from "../lib/launch";
import { names } from "../lib/summary";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

// Shown when files are opened with the installed app, for example "Open with TuneNook" in Finder. onAdding opens
// Add music, where the import shows its progress.
export function OpenedFiles({ onAdding }: { onAdding: () => void }) {
  const { files, failed, busy } = useOpened();
  const importing = useJob()?.running ?? false;
  if (files.length === 0 && failed.length === 0) return null;
  const one = files.length === 1;
  const what = one ? files[0].name : plural(files.length, "song");

  return (
    <Dialog label={files.length ? `Open ${what}` : "Couldn't open files"} className="opened-files" onClose={dismissOpened}>
      <div className="dialog-head">
        <h2 className="h3">{files.length ? `Open ${what}` : "Couldn't open files"}</h2>
      </div>
      <div className="confirm">
        <div>
          {files.length > 1 && <p className="muted">{names(files.map((f) => f.name))}</p>}
          {files.length > 0 && (
            <p className="muted">
              Play now keeps nothing: the {one ? "song is" : "songs are"} gone when you close TuneNook. Add to library copies{" "}
              {one ? "it" : "them"} in, so {one ? "it plays" : "they play"} offline from now on.
            </p>
          )}
          {failed.length > 0 && (
            <p className="xh-help err" role="alert">
              Couldn't read {names(failed)}. {failed.length === 1 ? "It may have been moved or deleted." : "They may have been moved or deleted."}
            </p>
          )}
          {importing && files.length > 0 && <p className="muted">Another import is running. Add to library once it finishes.</p>}
        </div>
        <div className="dialog-actions">
          {files.length > 0 && (
            <>
              <Button data-autofocus disabled={busy} onClick={() => void playOpened()}>
                {busy ? "Opening…" : "Play now"}
              </Button>
              <Button variant="secondary" disabled={busy || importing} onClick={() => addOpened() && onAdding()}>
                Add to library
              </Button>
            </>
          )}
          <Button variant="ghost" data-autofocus={files.length === 0 || undefined} onClick={dismissOpened}>
            {files.length ? "Cancel" : "Close"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
