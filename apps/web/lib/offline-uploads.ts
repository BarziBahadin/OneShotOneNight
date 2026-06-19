import { presignUpload, registerPhoto } from "@/lib/api";

const DB_NAME = "oneshotonenight-offline";
const DB_VERSION = 1;
const STORE = "photo_uploads";

export type OfflineUpload = {
  id: string;
  slug: string;
  accessToken: string;
  file: Blob;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  message: string;
  createdAt: number;
};

export type QueueResult = {
  uploaded: number;
  remaining: number;
};

export async function queueOfflinePhoto(input: Omit<OfflineUpload, "id" | "createdAt">) {
  const db = await openDB();
  const item: OfflineUpload = {
    ...input,
    id: randomID(),
    createdAt: Date.now()
  };
  await txDone(db.transaction(STORE, "readwrite").objectStore(STORE).add(item));
  await registerBackgroundSync();
  return item;
}

export async function queueOfflinePhotos(items: Array<Omit<OfflineUpload, "id" | "createdAt">>) {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const queued: OfflineUpload[] = [];
  for (const input of items) {
    const item = { ...input, id: randomID(), createdAt: Date.now() };
    store.add(item);
    queued.push(item);
  }
  await transactionDone(tx);
  await registerBackgroundSync();
  return queued;
}

export async function countQueuedPhotos() {
  const db = await openDB();
  const tx = db.transaction(STORE, "readonly");
  return requestResult<number>(tx.objectStore(STORE).count());
}

export async function flushQueuedPhotos(onProgress?: (message: string) => void): Promise<QueueResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { uploaded: 0, remaining: await countQueuedPhotos() };
  }
  const items = await allQueuedPhotos();
  let uploaded = 0;
  for (const item of items) {
    try {
      onProgress?.(`Uploading saved photo ${uploaded + 1} of ${items.length}...`);
      const file = new File([item.file], item.fileName, { type: item.contentType });
      const presigned = await presignUpload(item.slug, item.accessToken, file);
      const uploadResponse = await fetch(presigned.upload_url, { method: "PUT", headers: { "Content-Type": item.contentType }, body: file });
      if (!uploadResponse.ok) throw new Error(`Object storage rejected ${item.fileName}`);
      await registerPhoto(item.slug, item.accessToken, {
        photo_id: presigned.photo_id,
        object_key: presigned.object_key,
        content_type: item.contentType,
        size_bytes: item.sizeBytes,
        upload_token: presigned.upload_token,
        message: item.message
      });
      await deleteQueuedPhoto(item.id);
      uploaded++;
    } catch {
      break;
    }
  }
  return { uploaded, remaining: await countQueuedPhotos() };
}

export function installOfflineUploadSync(onStatus: (message: string) => void) {
  const flush = () => {
    flushQueuedPhotos(onStatus).then((result) => {
      if (result.uploaded > 0) {
        onStatus(result.remaining ? `${result.uploaded} saved photo${result.uploaded === 1 ? "" : "s"} uploaded. ${result.remaining} still waiting.` : `${result.uploaded} saved photo${result.uploaded === 1 ? "" : "s"} uploaded.`);
      }
    }).catch(() => undefined);
  };
  window.addEventListener("online", flush);
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "SYNC_UPLOAD_QUEUE") flush();
  });
  flush();
  return () => window.removeEventListener("online", flush);
}

async function allQueuedPhotos() {
  const db = await openDB();
  const tx = db.transaction(STORE, "readonly");
  const items = await requestResult<OfflineUpload[]>(tx.objectStore(STORE).getAll());
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

async function deleteQueuedPhoto(id: string) {
  const db = await openDB();
  await txDone(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(request: IDBRequest) {
  return requestResult(request);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function registerBackgroundSync() {
  const registration = await navigator.serviceWorker?.ready.catch(() => undefined);
  const syncManager = registration && "sync" in registration ? (registration as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync : null;
  await syncManager?.register("oneshotonenight-upload-queue").catch(() => undefined);
}

function randomID() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
