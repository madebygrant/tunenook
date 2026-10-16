import { IDBFactory } from "fake-indexeddb";
import { vi } from "vitest";
import type { Track } from "./types";

export function makeTrack(id: string, patch: Partial<Track> = {}): Track {
  return {
    id,
    title: `Song ${id}`,
    artist: "Artist",
    album: "",
    albumArtist: "Artist",
    trackNo: null,
    discNo: null,
    year: null,
    duration: 60,
    artId: null,
    fileName: `${id}.mp3`,
    size: 3,
    type: "audio/mpeg",
    addedAt: 1,
    sourceKey: `${id}.mp3\n3`,
    source: { kind: "copied" },
    ...patch,
  };
}

// jsdom has no media playback, object URLs or real storage; each test gets fresh ones and fresh module state.
export function freshEnvironment(): void {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  document.body.innerHTML = "";
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${n++}`);
  URL.revokeObjectURL = vi.fn();
  HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"));
  });
  HTMLMediaElement.prototype.load = vi.fn();
  HTMLMediaElement.prototype.canPlayType = vi.fn(() => "maybe" as CanPlayTypeResult);
}
