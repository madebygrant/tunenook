const DB_NAME = "tunenook";
const VERSION = 1;

export type StoreName = "tracks" | "files" | "art" | "playlists" | "folders";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("tracks", { keyPath: "id" });
      // Audio and artwork blobs sit apart from the metadata so loading the library never reads them.
      db.createObjectStore("files");
      db.createObjectStore("art");
      db.createObjectStore("playlists", { keyPath: "id" });
      // Directory handles from showDirectoryPicker; Chromium only, empty elsewhere.
      db.createObjectStore("folders", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await open();
  return result(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export type Write =
  | { store: StoreName; op: "put"; value: unknown; key?: string }
  | { store: StoreName; op: "delete"; key: string };

// One transaction, so a track never lands without its file or vice versa.
export async function write(writes: Write[]): Promise<void> {
  if (writes.length === 0) return;
  const db = await open();
  const tx = db.transaction([...new Set(writes.map((w) => w.store))], "readwrite");
  for (const w of writes) {
    const store = tx.objectStore(w.store);
    if (w.op === "put") store.put(w.value, w.key);
    else store.delete(w.key);
  }
  await done(tx);
}
