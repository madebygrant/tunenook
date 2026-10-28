import { useEffect, useMemo, useState } from "react";
import { plural } from "../lib/format";
import { useTrackMap } from "../lib/library";
import { clearUpNext, jumpTo, removeFromQueue, toggle, useNowPlaying, useQueue } from "../lib/player";
import { idAt } from "../lib/queue";
import { useSelection } from "../lib/useSelection";
import type { Track } from "../lib/types";
import { PlusIcon } from "./icons";
import { SelectButton, SelectionBar } from "./Selection";
import { MenuSheet, PlaylistPicker } from "./SongMenu";
import { SongList } from "./SongList";
import { Button } from "./ui";

export function Queue({
  onMore,
  onToast,
}: {
  onMore: (track: Track, pos: number) => void;
  onToast: (message: string) => void;
}) {
  const queue = useQueue();
  const now = useNowPlaying();
  const byId = useTrackMap();
  const rows = useMemo(
    () =>
      queue.order
        .map((_, pos) => ({ pos, track: byId.get(idAt(queue, pos)) }))
        .filter((r): r is { pos: number; track: Track } => r.track !== undefined),
    [queue, byId],
  );
  const current = rows.filter((r) => r.pos === queue.at);
  const upNext = useMemo(() => rows.filter((r) => r.pos > queue.at), [rows, queue.at]);
  const [saving, setSaving] = useState(false);
  // With repeat all the queue loops, so the songs before the current one play after it.
  const before = queue.repeat === "all" ? rows.filter((r) => r.pos < queue.at) : [];
  const saveIds = [...current, ...upNext, ...before].map((r) => r.track.id);
  const upNextTracks = useMemo(() => upNext.map((r) => r.track), [upNext]);
  // A row is its slot in the queue's song list, which stays put as playback moves on, so a repeated song's
  // copies can't swap places in the selection. The slot count changes on any add or remove, which clears it.
  const slots = useMemo(() => upNext.map((r) => `${queue.ids.length}:${queue.order[r.pos]}`), [upNext, queue]);
  // Only Up next is selectable; the playing song has its own menu.
  const selection = useSelection(upNextTracks, slots);
  const { active: selecting, stop: stopSelecting } = selection;

  useEffect(() => {
    if (selecting && upNext.length === 0) stopSelecting();
  }, [selecting, upNext.length, stopSelecting]);

  function removeSelected(indexes: number[]) {
    removeFromQueue(indexes.map((i) => upNext[i].pos));
    onToast(`Removed ${plural(indexes.length, "song")} from the queue.`);
  }

  return (
    <section aria-labelledby="queue-title">
      <div className="page-head">
        <h1 id="queue-title" className="display-lg" tabIndex={-1}>
          Queue
        </h1>
      </div>
      {current.length === 0 ? (
        <p className="lead muted">Nothing is queued. Play a song, album or playlist to start.</p>
      ) : (
        <>
          <div className="head-actions">
            <Button small variant="secondary" icon={<PlusIcon />} onClick={() => setSaving(true)}>
              Save as playlist
            </Button>
          </div>
          {saving && (
            <MenuSheet label="Save queue as a playlist" title="Save queue" subtitle={plural(saveIds.length, "song")} onClose={() => setSaving(false)}>
              <PlaylistPicker
                ids={saveIds}
                name="the queue"
                onDone={(message) => {
                  setSaving(false);
                  onToast(message);
                }}
              />
            </MenuSheet>
          )}
          <h2 className="h3 section-title">Now playing</h2>
          <SongList
            label="Now playing"
            tracks={current.map((r) => r.track)}
            currentIndex={0}
            playing={now.playing}
            onPlay={toggle}
            onMore={() => onMore(current[0].track, current[0].pos)}
          />
          <div className="section-head">
            <h2 className="h3 section-title">Up next</h2>
            <span className="count">{plural(upNext.length, "song")}</span>
            {upNext.length > 0 && !selecting && (
              <span className="section-tools">
                <Button variant="ghost" small onClick={clearUpNext}>
                  Clear
                </Button>
                <SelectButton small selection={selection} />
              </span>
            )}
          </div>
          {upNext.length === 0 ? (
            <p className="list-empty muted">
              {queue.repeat === "all" ? "The queue starts again from the top." : "Nothing after this song."}
            </p>
          ) : (
            <>
              {selecting && (
                <SelectionBar
                  selection={selection}
                  tracks={upNextTracks}
                  removal={{ kind: "custom", label: "Remove from queue", short: "Remove", run: removeSelected }}
                  onToast={onToast}
                />
              )}
              <SongList
                label="Up next"
                tracks={upNextTracks}
                currentIndex={null}
                playing={false}
                onPlay={(i) => jumpTo(upNext[i].pos)}
                onMore={(i) => onMore(upNext[i].track, upNext[i].pos)}
                selection={selection}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
