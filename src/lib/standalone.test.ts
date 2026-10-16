import { describe, expect, it } from "vitest";
import { canAddToHomeScreen, isIOS, isStandalone } from "./standalone";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_WEBVIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("isIOS", () => {
  it("matches iPhone", () => {
    expect(isIOS({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
  });

  it("matches an iPad reporting a Mac user agent, but not a Mac", () => {
    expect(isIOS({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
  });

  it("doesn't match Android", () => {
    expect(isIOS({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });
});

describe("canAddToHomeScreen", () => {
  it("is true in iOS Safari and false in an in-app web view", () => {
    expect(canAddToHomeScreen({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(canAddToHomeScreen({ userAgent: IPHONE_WEBVIEW, maxTouchPoints: 5 })).toBe(false);
  });
});

describe("isStandalone", () => {
  const nav = { userAgent: IPHONE, maxTouchPoints: 5 };

  it("trusts the display-mode query", () => {
    expect(isStandalone(true, nav)).toBe(true);
    expect(isStandalone(false, nav)).toBe(false);
  });

  it("falls back to navigator.standalone", () => {
    expect(isStandalone(false, { ...nav, standalone: true })).toBe(true);
  });
});
