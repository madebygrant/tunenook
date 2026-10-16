import { useMediaQuery } from "./useMediaQuery";

type Nav = Pick<Navigator, "userAgent" | "maxTouchPoints"> & { standalone?: boolean };

// navigator.standalone is the older Safari signal; the media query covers everything newer.
export function isStandalone(displayModeStandalone: boolean, nav: Nav = navigator): boolean {
  return displayModeStandalone || nav.standalone === true;
}

// iPadOS reports a Mac user agent by default; real Macs have no touch points.
export function isIOS(nav: Pick<Nav, "userAgent" | "maxTouchPoints"> = navigator): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

// In-app browsers (Gmail, Slack, Instagram) are bare web views with no "Safari/" token and no Add to Home Screen.
export function canAddToHomeScreen(nav: Nav = navigator): boolean {
  return isIOS(nav) && /Safari\//.test(nav.userAgent);
}

export function useStandalone(): boolean {
  return isStandalone(useMediaQuery("(display-mode: standalone)"));
}
