import { describe, expect, it } from "vitest";
import { crc32, zip } from "./zip";

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });

  it("stores each file where the central directory says it is", async () => {
    const blob = zip([
      { name: "tunenook-backup.json", text: "{}" },
      { name: "Playlists/Road trip.m3u8", text: "#EXTM3U\n" },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    let at = view.getUint32(end + 16, true);
    const names: string[] = [];
    for (let i = 0; i < 2; i++) {
      const nameLength = view.getUint16(at + 28, true);
      const local = view.getUint32(at + 42, true);
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      names.push(new TextDecoder().decode(bytes.slice(at + 46, at + 46 + nameLength)));
      at += 46 + nameLength;
    }
    expect(names).toEqual(["tunenook-backup.json", "Playlists/Road trip.m3u8"]);
  });
});
