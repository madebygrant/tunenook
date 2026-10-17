import { useEffect, useRef, useState } from "react";
import { canLinkFolders, copyIntoLibrary, NeedsAccessError, NotEnoughSpaceError, requestAccess, scanFolder, unlinkFolder, useGranted, linkFolder } from "../lib/folders";
import { backupToFolder, backupZip } from "../lib/backup";
import { download } from "../lib/download";
import { formatBytes, plural } from "../lib/format";
import { bytesToImport, importFiles } from "../lib/importer";
import { cancelJob, dismissJob, runJob, useJob } from "../lib/job";
import { getTracks, useFolders, useTracks } from "../lib/library";
import { promptInstall, useCanInstall } from "../lib/pwa";
import { isIOS, useStandalone } from "../lib/standalone";
import { ensurePersistence, freeBytes, useStorage } from "../lib/storage";
import { describeImport } from "../lib/summary";
import type { LinkedFolder } from "../lib/types";
import { Dialog } from "./Dialog";
import { DownloadIcon, FolderIcon, RefreshIcon, TrashIcon, UploadIcon } from "./icons";
import { InstallHint } from "./InstallHint";
import { Confirm } from "./SongMenu";
import { Button, Panel } from "./ui";

// File handling only works in installed desktop Chromium, the same browsers that can link folders.
const canOpenWith = canLinkFolders && "launchQueue" in window;

const ACCEPT = "audio/*,.mp3,.m4a,.m4b,.aac,.flac,.wav,.aif,.aiff,.ogg,.oga,.opus,.m3u,.m3u8,.json";

export function AddMusic() {
  const job = useJob();
  const folders = useFolders();
  const tracks = useTracks();
  // During an import the track list changes several times a second; usage is re-read when it finishes.
  const storage = useStorage(job?.running ? "importing" : tracks.length);
  const standalone = useStandalone();
  const canInstall = useCanInstall();
  const [spaceWarning, setSpaceWarning] = useState<{ files: File[]; needed: number; free: number } | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [ios] = useState(() => isIOS());

  // React has no prop for webkitdirectory.
  useEffect(() => {
    folder.current?.setAttribute("webkitdirectory", "");
  }, []);

  function startImport(picked: File[]) {
    setSpaceWarning(null);
    void ensurePersistence(true);
    void runJob("Adding songs", async (onProgress, signal) => describeImport(await importFiles(picked, onProgress, signal)));
  }

  // Warns before a pick that can't fit, rather than failing partway through.
  async function importPicked(list: FileList | null) {
    if (!list?.length) return;
    const picked = [...list];
    const needed = bytesToImport(picked, getTracks());
    const free = needed > 0 ? await freeBytes() : null;
    if (free !== null && needed > free) setSpaceWarning({ files: picked, needed, free });
    else startImport(picked);
  }

  return (
    <section aria-labelledby="add-title">
      <div className="page-head">
        <h1 id="add-title" className="display-lg" tabIndex={-1}>
          Add music
        </h1>
      </div>
      <InstallHint />
      <div className="page-body">
        {job && <JobPanel />}
        <Panel>
          <h2 className="h3">Copy songs into TuneNook</h2>
          <p className="muted">
            Pick audio files and any .m3u playlists that go with them. TuneNook keeps its own copy on this device, so songs play
            with no connection.
            {ios && " On iPhone the copy takes its own space; you can delete the originals from Files afterwards."}
          </p>
          <div className="dialog-actions">
            <Button icon={<UploadIcon />} disabled={job?.running} onClick={() => files.current?.click()}>
              Choose files
            </Button>
            {!ios && (
              <Button variant="secondary" icon={<FolderIcon />} disabled={job?.running} onClick={() => folder.current?.click()}>
                Choose a folder
              </Button>
            )}
          </div>
          <input
            ref={files}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              void importPicked(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={folder}
            type="file"
            hidden
            onChange={(e) => {
              void importPicked(e.target.files);
              e.target.value = "";
            }}
          />
          {ios && (
            <p className="xh-help">
              Songs in the Music app can't be opened by web apps. Files in iCloud Drive or On My iPhone can.
            </p>
          )}
        </Panel>
        {canLinkFolders && (
          <Panel>
            <h2 className="h3">Play a folder in place</h2>
            <p className="muted">
              Link a music folder and TuneNook plays the files where they are, with no copy. The browser asks for access again
              each time you open TuneNook. You can copy a linked folder in later.
            </p>
            {folders.map((f) => (
              <FolderRow key={f.id} folder={f} busy={job?.running ?? false} />
            ))}
            <Button
              variant="secondary"
              icon={<FolderIcon />}
              disabled={job?.running}
              onClick={() =>
                void runJob("Linking folder", async (onProgress) => {
                  const summary = await linkFolder(onProgress);
                  return summary && describeImport(summary);
                })
              }
            >
              Link a folder
            </Button>
          </Panel>
        )}
        {tracks.length > 0 && (
          <Panel>
            <h2 className="h3">Back up</h2>
            {canLinkFolders ? (
              <p className="muted">
                Writes the songs TuneNook holds, your playlists, and your likes, play counts and edits into a folder you pick.
                Nothing there is overwritten, and backing up to the same folder again only adds what's new. To restore, add the
                folder with Choose a folder.
              </p>
            ) : (
              <p className="muted">
                This browser can't write to a folder, so the backup has your playlists, likes, play counts and edits, but not the
                songs. To restore, add your music together with the unzipped backup.
              </p>
            )}
            <div className="dialog-actions">
              {canLinkFolders ? (
                <Button
                  variant="secondary"
                  icon={<FolderIcon />}
                  disabled={job?.running}
                  onClick={() => void runJob("Backing up", (onProgress, signal) => backupToFolder(onProgress, signal))}
                >
                  Back up to a folder
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  icon={<DownloadIcon />}
                  onClick={() => download(backupZip(), `tunenook-backup-${new Date().toISOString().slice(0, 10)}.zip`)}
                >
                  Download backup
                </Button>
              )}
            </div>
          </Panel>
        )}
        {storage && (
          <Panel>
            <h2 className="h3">Storage</h2>
            <p className="muted">
              Using <b className="mono">{formatBytes(storage.usage)}</b> of about <b className="mono">{formatBytes(storage.quota)}</b>{" "}
              available to TuneNook.{" "}
              {storage.persisted
                ? "The browser won't clear it to free space."
                : "The browser may clear it if the device runs low on space."}
            </p>
            {!storage.persisted && !standalone && ios && (
              <p className="muted">Add TuneNook to your Home Screen and iOS keeps its storage.</p>
            )}
            {(!storage.persisted || canOpenWith) && !standalone && !ios && canInstall && (
              <div className="storage-install">
                <p className="muted">
                  Install TuneNook and{" "}
                  {[
                    !storage.persisted && "the browser keeps its storage",
                    canOpenWith && "you can open audio files with it from Finder or File Explorer",
                  ]
                    .filter(Boolean)
                    .join(", and ")}
                  .
                </p>
                <Button variant="secondary" small onClick={() => void promptInstall()}>
                  Install
                </Button>
              </div>
            )}
          </Panel>
        )}
        {spaceWarning && (
          <Dialog label="Not enough space" className="space-warning" onClose={() => setSpaceWarning(null)}>
            <div className="dialog-head">
              <h2 className="h3">Not enough space</h2>
            </div>
            <div className="confirm">
              <div>
                <p className="muted">
                  These songs need up to <b className="mono">{formatBytes(spaceWarning.needed)}</b> and about{" "}
                  <b className="mono">{formatBytes(spaceWarning.free)}</b> is free. Songs already here under another file name
                  are only found as they're read, so they're counted in that total but won't take space.
                </p>
                <p className="muted">TuneNook will add songs until the space runs out, or you can pick fewer.</p>
              </div>
              <div className="dialog-actions">
                <Button variant="secondary" onClick={() => startImport(spaceWarning.files)}>
                  Add what fits
                </Button>
                <Button variant="ghost" data-autofocus onClick={() => setSpaceWarning(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Dialog>
        )}
      </div>
    </section>
  );
}

function JobPanel() {
  const job = useJob();
  if (!job) return null;
  const { progress } = job;
  return (
    <div className="xh-panel job" role="status">
      <h2 className="h3">{job.label}</h2>
      {job.running && progress && (
        <>
          <div className="prog">
            <span>
              {progress.done} of {progress.total}
            </span>
            <div className="xh-track">
              <div className="fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
          <p className="subtle job-file">{progress.current}</p>
        </>
      )}
      {job.running && !progress && <p className="subtle">Starting…</p>}
      {job.result && <p>{job.result}</p>}
      {job.error && <p className="error-text">{job.error}</p>}
      <div className="dialog-actions">
        {job.running ? (
          <Button variant="secondary" onClick={cancelJob}>
            Stop
          </Button>
        ) : (
          <Button variant="ghost" onClick={dismissJob}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}

function FolderRow({ folder, busy }: { folder: LinkedFolder; busy: boolean }) {
  const granted = useGranted(folder.id);
  const tracks = useTracks();
  const [confirming, setConfirming] = useState(false);
  const linked = tracks.filter((t) => t.source.kind === "linked" && t.source.folderId === folder.id);
  const bytes = linked.reduce((sum, t) => sum + t.size, 0);

  function copyAll() {
    void ensurePersistence(true);
    void runJob(`Copying ${folder.name} into TuneNook`, async (onProgress, signal) => {
      const todo = getTracks().filter((t) => t.source.kind === "linked" && t.source.folderId === folder.id);
      try {
        const result = await copyIntoLibrary(todo, onProgress, signal);
        const parts = [`Copied ${plural(result.copied, "song")}.`];
        if (result.stoppedForSpace) parts.push("Stopped: the device is out of space.");
        if (result.failed.length) parts.push(`Couldn't copy ${plural(result.failed.length, "song")}.`);
        if (result.copied === todo.length) parts.push(`You can unlink ${folder.name} now without losing songs.`);
        return parts.join(" ");
      } catch (e) {
        if (e instanceof NotEnoughSpaceError) {
          throw new Error(`Not enough space: this needs ${formatBytes(e.needed)} and about ${formatBytes(e.available)} is free.`);
        }
        if (e instanceof NeedsAccessError) throw new Error("TuneNook lost access to the folder. Allow access and try again.");
        throw e;
      }
    });
  }

  return (
    <div className="folder-row">
      <div className="folder-info">
        <span className="ttl">{folder.name}</span>
        <span className="subtle">
          {linked.length ? `${plural(linked.length, "linked song")} · ${formatBytes(bytes)}` : "Everything is copied in"}
        </span>
      </div>
      <div className="dialog-actions">
        {!granted ? (
          <Button variant="secondary" small onClick={() => void requestAccess(folder.id)}>
            Allow access
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              small
              icon={<RefreshIcon />}
              disabled={busy}
              onClick={() => void runJob(`Rescanning ${folder.name}`, async (onProgress, signal) => describeImport(await scanFolder(folder, onProgress, signal)))}
            >
              Rescan
            </Button>
            {linked.length > 0 && (
              <Button variant="secondary" small icon={<UploadIcon />} disabled={busy} onClick={copyAll}>
                Copy into TuneNook
              </Button>
            )}
          </>
        )}
        <Button variant="ghost" small icon={<TrashIcon />} disabled={busy} onClick={() => setConfirming(true)}>
          Unlink
        </Button>
      </div>
      {confirming && (
        <Dialog label={`Unlink ${folder.name}`} onClose={() => setConfirming(false)}>
          <div className="dialog-head">
            <h2 className="h3">Unlink {folder.name}?</h2>
          </div>
          <Confirm
            message={
              linked.length
                ? `${plural(linked.length, "song")} that aren't copied in will leave your library and playlists. The files in the folder stay.`
                : "All its songs are copied in, so nothing leaves your library."
            }
            action="Unlink folder"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              void runJob(`Unlinking ${folder.name}`, async () => {
                await unlinkFolder(folder.id);
                return `Unlinked ${folder.name}.`;
              });
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
