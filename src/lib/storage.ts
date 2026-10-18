import { useEffect, useState, useSyncExternalStore } from "react";
import { storedBytes } from "./library";
import { createListeners } from "./store";

export interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean;
}

const { emit, subscribe } = createListeners();
let version = 0;

function changed(): void {
  version++;
  emit();
}

export async function estimateStorage(): Promise<StorageInfo | null> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (!estimate?.quota) return null;
  const persisted = (await navigator.storage?.persisted?.().catch(() => false)) ?? false;
  // WebKit reports a usage that leaves out the audio it holds, so never show less than the songs TuneNook stores.
  const usage = Math.max(estimate.usage ?? 0, storedBytes());
  return { usage, quota: estimate.quota, persisted };
}

export async function freeBytes(): Promise<number | null> {
  const info = await estimateStorage();
  return info ? Math.max(0, info.quota - info.usage) : null;
}

// Chrome grants persistence from engagement and installation, so a refusal on day one can turn into a yes later.
// Firefox shows a permission prompt instead, so it is only asked from a tap (fromTap).
export async function ensurePersistence(fromTap = false): Promise<boolean> {
  const storage = navigator.storage;
  if (!storage?.persist || !storage.persisted) return false;
  if (await storage.persisted().catch(() => false)) return true;
  if (!fromTap && /Firefox\//.test(navigator.userAgent)) return false;
  const granted = await storage.persist().catch(() => false);
  if (granted) changed();
  return granted;
}

// Re-reads whenever the given value changes (the track list after an import) or persistence is granted.
export function useStorage(refresh: unknown): StorageInfo | null {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const granted = useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    let live = true;
    void estimateStorage().then((next) => live && setInfo(next));
    return () => {
      live = false;
    };
  }, [refresh, granted]);
  return info;
}
