import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePersistence, freeBytes } from "./storage";

function stubStorage(persisted: boolean, grant: boolean) {
  const storage = {
    persisted: vi.fn().mockResolvedValue(persisted),
    persist: vi.fn().mockResolvedValue(grant),
    estimate: vi.fn().mockResolvedValue({ usage: 300, quota: 1000 }),
  };
  vi.stubGlobal("navigator", { ...navigator, storage, userAgent: navigator.userAgent });
  return storage;
}

afterEach(() => vi.unstubAllGlobals());

describe("ensurePersistence", () => {
  it("doesn't ask again once granted", async () => {
    const storage = stubStorage(true, true);
    expect(await ensurePersistence()).toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it("asks when not yet granted", async () => {
    const storage = stubStorage(false, true);
    expect(await ensurePersistence()).toBe(true);
    expect(storage.persist).toHaveBeenCalled();
  });

  it("leaves Firefox alone outside a tap, because it shows a prompt", async () => {
    const storage = stubStorage(false, true);
    vi.stubGlobal("navigator", { ...navigator, storage, userAgent: "Mozilla/5.0 Firefox/140.0" });
    expect(await ensurePersistence()).toBe(false);
    expect(storage.persist).not.toHaveBeenCalled();
    expect(await ensurePersistence(true)).toBe(true);
  });
});

describe("freeBytes", () => {
  it("is quota minus usage", async () => {
    stubStorage(false, false);
    expect(await freeBytes()).toBe(700);
  });
});
