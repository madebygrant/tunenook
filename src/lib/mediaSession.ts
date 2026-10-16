// Live streams report Infinity, and setPositionState throws on a non-finite duration or a position past it.
export function positionState(duration: number, position: number, playbackRate: number): MediaPositionState | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return { duration, position: Math.min(Math.max(position, 0), duration), playbackRate };
}

export function publishPosition(audio: HTMLAudioElement): void {
  if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
  const state = positionState(audio.duration, audio.currentTime, audio.playbackRate);
  try {
    navigator.mediaSession.setPositionState(state ?? undefined);
  } catch {
    // A zero playbackRate is rejected; the lock screen keeps its last state.
  }
}

// Without this, iOS keeps the lock-screen scrubber moving after a pause.
export function publishPlaybackState(state: MediaSessionPlaybackState): void {
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = state;
}
