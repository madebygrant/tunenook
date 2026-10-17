export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked later, since Safari starts the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const MAX_NAME = 150;

// Characters that file systems or the File System Access API refuse in a name, and names past most systems' limit,
// which are cut short before the extension.
export function safeFileName(name: string): string {
  const printable = [...name].map((c) => (c.charCodeAt(0) < 32 ? "_" : c)).join("");
  let cleaned = printable.replace(/[<>:"/\\|?*]/g, "_").replace(/[. ]+$/, "").trim();
  if (cleaned.length > MAX_NAME) {
    const ext = /\.[^.]{1,8}$/.exec(cleaned)?.[0] ?? "";
    cleaned = cleaned.slice(0, MAX_NAME - ext.length).trimEnd() + ext;
  }
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "_" : cleaned;
}
