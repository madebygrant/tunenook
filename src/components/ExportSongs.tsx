import { useEffect, useState } from "react";
import { canShareFiles, downloadFiles, PartialSaveError, prepareExport, saveToFolder, shareFiles, type PreparedExport } from "../lib/exportSongs";
import { canLinkFolders } from "../lib/folders";
import { isIOS } from "../lib/standalone";
import { formatBytes, plural } from "../lib/format";
import { DownloadIcon, FolderIcon, ShareIcon } from "./icons";
import { Button } from "./ui";

// Files are got ready first and handed over from a second tap, because Safari only opens the share sheet straight
// from a tap, and reading an album of songs takes longer than it allows.
export function ExportSongs({ ids, onDone }: { ids: string[]; onDone: (message: string) => void }) {
  const [done, setDone] = useState(0);
  const [ready, setReady] = useState<PreparedExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyed on the songs, not the array, which pages build afresh on every render.
  const key = ids.join("\n");
  useEffect(() => {
    let live = true;
    prepareExport(key.split("\n"), (n) => live && setDone(n)).then(
      (result) => live && setReady(result),
      () => live && setError("Couldn't read these songs. Try again."),
    );
    return () => {
      live = false;
    };
  }, [key]);

  if (error && !ready) {
    return (
      <p className="xh-help err" role="alert">
        {error}
      </p>
    );
  }
  if (!ready) {
    const total = new Set(ids).size;
    // The count changes for every song, so it stays out of the status a screen reader announces.
    return (
      <p className="muted">
        <span role="status">Getting {plural(total, "song")} ready…</span>{" "}
        <span className="mono" aria-hidden="true">
          {done} of {total}
        </span>
      </p>
    );
  }

  const { files, linked, unreadable, uncovered } = ready;
  const count = plural(files.length, "song");
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const share = canShareFiles(files);

  async function act(run: () => Promise<string | null>, failure: (e: unknown) => string) {
    setBusy(true);
    setError(null);
    try {
      const message = await run();
      if (message) onDone(message);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirm">
      {files.length > 0 ? (
        <p>
          {count}, <span className="mono">{formatBytes(bytes)}</span>, ready to export.
          {share && isIOS() && ` To keep ${files.length === 1 ? "it" : "them"} on this device, choose Save to Files when you share.`}
        </p>
      ) : linked.length > 0 && unreadable.length === 0 ? (
        <p>These songs are in a linked folder, so they're already files on this device.</p>
      ) : (
        <p>Couldn't read these songs from TuneNook's storage, so there's nothing to export.</p>
      )}
      {files.length > 0 && linked.length > 0 && (
        <p>
          {plural(linked.length, "song")} from a linked folder {linked.length === 1 ? "isn't" : "aren't"} included, as{" "}
          {linked.length === 1 ? "it's" : "they're"} already a file on this device.
        </p>
      )}
      {uncovered.length > 0 && (
        <p>
          {plural(uncovered.length, "song")} will go without {uncovered.length === 1 ? "its" : "their"} cover, as{" "}
          {uncovered.length === 1 ? "its file is" : "their files are"} laid out in a way TuneNook can't add one to.
        </p>
      )}
      {files.length > 0 && unreadable.length > 0 && (
        <p>
          {plural(unreadable.length, "song")} couldn't be read, so {unreadable.length === 1 ? "it isn't" : "they aren't"}{" "}
          included.
        </p>
      )}
      {files.length > 0 && (
        <div className="dialog-actions">
          {share && (
            <Button
              icon={<ShareIcon />}
              disabled={busy}
              onClick={() =>
                void act(
                  async () => ((await shareFiles(files)) ? `Shared ${count}.` : null),
                  () => "Couldn't share these songs. Try fewer at a time, or save them another way.",
                )
              }
            >
              Share…
            </Button>
          )}
          {canLinkFolders ? (
            <Button
              variant="secondary"
              icon={<FolderIcon />}
              disabled={busy}
              onClick={() =>
                void act(
                  async () => ((await saveToFolder(files)) === null ? null : `Saved ${count} to the folder.`),
                  (e) =>
                    e instanceof PartialSaveError && e.written > 0
                      ? `Saved ${e.written} of ${files.length} before it stopped. Check there's space and save again to the same folder to finish.`
                      : "Couldn't save these songs. Check there's space and try again.",
                )
              }
            >
              Save to a folder
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={<DownloadIcon />}
              disabled={busy}
              onClick={() =>
                void act(
                  async () => {
                    await downloadFiles(files);
                    return `Downloading ${count}.`;
                  },
                  () => "Couldn't download these songs. Try again.",
                )
              }
            >
              Download
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="xh-help err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
