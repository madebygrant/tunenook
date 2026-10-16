import { useMemo } from "react";
import { plural } from "../lib/format";
import { useTrackMap } from "../lib/library";
import { clearUpNext, jumpTo, toggle, useNowPlaying, useQueue } from "../lib/player";
import { idAt } from "../lib/queue";
import type { Track } from "../lib/types";
import { SongList } from "./SongList";
import { Button } from "./ui";

export function Queue({ onMore }: { onMore: (track: Track, pos: number) => void }) {
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
  const upNext = rows.filter((r) => r.pos > queue.at);

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
            {upNext.length > 0 && (
              <Button variant="ghost" small onClick={clearUpNext}>
                Clear
              </Button>
            )}
          </div>
          {upNext.length === 0 ? (
            <p className="list-empty muted">
              {queue.repeat === "all" ? "The queue starts again from the top." : "Nothing after this song."}
            </p>
          ) : (
            <SongList
              label="Up next"
              tracks={upNext.map((r) => r.track)}
              currentIndex={null}
              playing={false}
              onPlay={(i) => jumpTo(upNext[i].pos)}
              onMore={(i) => onMore(upNext[i].track, upNext[i].pos)}
            />
          )}
        </>
      )}
    </section>
  );
}
