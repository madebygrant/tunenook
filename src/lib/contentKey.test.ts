import { describe, expect, it } from "vitest";
import { contentKey } from "./contentKey";

const song = (size: number, seed: number) => {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + seed) % 251;
  return bytes;
};

describe("contentKey", () => {
  it("is the same for a renamed copy", async () => {
    const data = song(300_000, 1);
    const original = new File([data], "01 Intro.mp3");
    const renamed = new File([data], "Intro (copy).mp3");
    expect(await contentKey(renamed)).toBe(await contentKey(original));
  });

  it("differs for another file of the same size, and for a change near either end", async () => {
    const data = song(300_000, 1);
    const key = await contentKey(new Blob([data]));
    expect(await contentKey(new Blob([song(300_000, 2)]))).not.toBe(key);
    const changedEnd = data.slice();
    changedEnd[changedEnd.length - 10] ^= 1;
    expect(await contentKey(new Blob([changedEnd]))).not.toBe(key);
  });

  it("handles files smaller than the sample", async () => {
    expect(await contentKey(new Blob([song(100, 1)]))).toMatch(/^100:[0-9a-f]{64}$/);
  });
});
