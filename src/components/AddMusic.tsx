import { useEffect, useRef, useState } from "react";
import { canLinkFolders, copyIntoLibrary, NeedsAccessError, NotEnoughSpaceError, requestAccess, scanFolder, unlinkFolder, useGranted, linkFolder } from "../lib/folders";
import { albumsToLookUp, findMissingArt, needsArt, setArtLookup, useArtLookup } from "../lib/artLookup";
import { formatBytes, plural } from "../lib/format";
import { bytesToImport, importFiles } from "../lib/importer";
import { runJob, useJob } from "../lib/job";
import { getTracks, useAlbums, useFolders, useTracks } from "../lib/library";
import { isIOS } from "../lib/standalone";
import { ensurePersistence, freeBytes } from "../lib/storage";
import { describeImport } from "../lib/summary";
import type { LinkedFolder } from "../lib/types";
import { Dialog } from "./Dialog";
import { FolderIcon, RefreshIcon, TrashIcon, UploadIcon } from "./icons";
import { JobPanel } from "./JobPanel";
import { InstallHint } from "./InstallHint";
import { Confirm } from "./SongMenu";
import { BandSwitch, Button, Panel } from "./ui";

const ACCEPT = "audio/*,.mp3,.m4a,.m4b,.aac,.flac,.wav,.aif,.aiff,.ogg,.oga,.opus,.m3u,.m3u8,.json";

export function AddMusic() {
  const job = useJob();
  const folders = useFolders();
  const tracks = useTracks();
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
        {tracks.length > 0 && <ArtLookupPanel busy={job?.running ?? false} />}
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

// The only feature that reaches another server, so it says exactly what is sent and does nothing until asked.
function ArtLookupPanel({ busy }: { busy: boolean }) {
  const on = useArtLookup();
  const albums = useAlbums();
  const missing = albums.filter(needsArt).length;
  // Re-read after each job, since a run records the albums it found nothing for.
  const toLookUp = busy ? 0 : albumsToLookUp(albums).length;
  return (
    <Panel>
      <h2 className="h3">Online artwork</h2>
      <p className="muted">
        TuneNook keeps everything on this device. With this on, you can ask it to find covers for albums that have none: it
        sends each album's title and artist to MusicBrainz and downloads the cover from the Cover Art Archive. Nothing is
        looked up until you ask.
      </p>
      <BandSwitch
        label="Look up missing artwork online"
        options={[
          { value: "off", label: "Off" },
          { value: "on", label: "On" },
        ]}
        value={on ? "on" : "off"}
        onChange={(v) => setArtLookup(v === "on")}
      />
      {on && (
        <div className="dialog-actions">
          <Button
            variant="secondary"
            disabled={busy || toLookUp === 0}
            onClick={() => void runJob("Finding artwork", (onProgress, signal) => findMissingArt(onProgress, signal))}
          >
            {missing === 0 ? "Every album has artwork" : toLookUp ? `Find artwork for ${plural(toLookUp, "album")}` : "Nothing new to look up"}
          </Button>
        </div>
      )}
      {on && missing > toLookUp && !busy && (
        <p className="xh-help">
          {plural(missing - toLookUp, "album")} had no match on MusicBrainz in the last 30 days, so {missing - toLookUp === 1 ? "it's" : "they're"}{" "}
          skipped. Each album page can still look one up.
        </p>
      )}
    </Panel>
  );
}
