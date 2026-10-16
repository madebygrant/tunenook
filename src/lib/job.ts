import { useSyncExternalStore } from "react";
import type { Progress } from "./importer";
import { createListeners } from "./store";

// Imports outlive the Add music page, so their progress and result live here rather than in its state.
export interface Job {
  label: string;
  progress: Progress | null;
  running: boolean;
  result: string | null;
  error: string | null;
}

let job: Job | null = null;
let controller: AbortController | null = null;
const { emit, subscribe } = createListeners();

function set(next: Job | null): void {
  job = next;
  emit();
}

export async function runJob(label: string, work: (onProgress: (p: Progress) => void, signal: AbortSignal) => Promise<string | null>): Promise<void> {
  if (job?.running) return;
  controller = new AbortController();
  set({ label, progress: null, running: true, result: null, error: null });
  try {
    const result = await work((progress) => job && set({ ...job, progress }), controller.signal);
    set(result === null ? null : { ...job!, running: false, result: controller.signal.aborted ? `Stopped. ${result}` : result });
  } catch (e) {
    set({ ...job!, running: false, error: e instanceof Error ? e.message : "Something went wrong." });
  }
}

export function cancelJob(): void {
  controller?.abort();
}

export function dismissJob(): void {
  if (!job?.running) set(null);
}

export function useJob(): Job | null {
  return useSyncExternalStore(subscribe, () => job);
}
