/**
 * Keeper private-key persistence (design-doc §5.3, Spec 4).
 *
 * The keeper's ECDH private key is generated NON-EXTRACTABLE in their browser
 * (generateKeeperKeyPair) and stored here as a CryptoKey object via structured
 * clone. IndexedDB can hold such a key without ever exposing its raw bytes to
 * JavaScript, so the key never reaches the server, localStorage or a log.
 * Entries are keyed per keeper row (one person may keep for several owners).
 * No crypto.subtle calls live in this file.
 */

"use client";

const DB_NAME = "will-o-wisp-keeper";
const STORE = "keeper-private-keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open key storage."));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("Key storage failed."));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("Key storage was interrupted."));
        };
      })
  );
}

export async function saveKeeperPrivateKey(keeperId: string, key: CryptoKey): Promise<void> {
  await run("readwrite", (s) => s.put(key, keeperId));
}

export async function loadKeeperPrivateKey(keeperId: string): Promise<CryptoKey | null> {
  const found = await run<unknown>("readonly", (s) => s.get(keeperId));
  return found instanceof CryptoKey ? found : null;
}

export async function deleteKeeperPrivateKey(keeperId: string): Promise<void> {
  await run("readwrite", (s) => s.delete(keeperId));
}
