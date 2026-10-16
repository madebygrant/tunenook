import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";
import { createListeners } from "./store";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let updateReady = false;
let reloadPending = false;
let updateSW: (() => Promise<void>) | null = null;
const { emit, subscribe } = createListeners();

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
      emit();
    },
    // Runs in every open window once the new worker takes control, so App holds the reload until playback stops.
    onNeedReload: markReloadPending,
    // An installed app never navigates, so it would otherwise only update on cold launch.
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (document.visibilityState === "visible") void registration.update().catch(() => {});
      };
      document.addEventListener("visibilitychange", check);
      setInterval(check, UPDATE_CHECK_MS);
    },
  });
}

export function applyUpdate(): void {
  // onNeedReload skips a session that started with no controller, such as the first launch after install.
  navigator.serviceWorker?.addEventListener("controllerchange", markReloadPending, { once: true });
  void updateSW?.();
}

function markReloadPending(): void {
  reloadPending = true;
  emit();
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(subscribe, () => updateReady);
}

export function useReloadPending(): boolean {
  return useSyncExternalStore(subscribe, () => reloadPending);
}

// Asks the browser not to evict this origin's storage under storage pressure. Firefox prompts, so call it from a tap.
export function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => {});
}
