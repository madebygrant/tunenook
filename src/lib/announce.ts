import { useSyncExternalStore } from "react";
import { createListeners } from "./store";

const { emit, subscribe } = createListeners();
let message = "";

// Screen readers skip a live region whose text didn't change, so a repeat gets a trailing no-break space.
export function announce(text: string): void {
  message = message === text ? `${text} ` : text;
  emit();
}

export function getAnnouncement(): string {
  return message;
}

export function useAnnouncement(): string {
  return useSyncExternalStore(subscribe, getAnnouncement);
}
