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

let installEvent: BeforeInstallPromptEvent | null = null;

// Chrome and Edge only. Installing also makes Chrome grant persistent storage.
export function listenForInstall(onInstalled: () => void): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    emit();
    onInstalled();
  });
}

export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribe, () => installEvent !== null);
}

export async function promptInstall(): Promise<void> {
  const e = installEvent;
  if (!e) return;
  // The event can only prompt once.
  installEvent = null;
  emit();
  await e.prompt();
}
