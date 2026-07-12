const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const defaultSupabaseApiBase = "https://huakafctiajezinrzfle.supabase.co/functions/v1/api";
const publicWebBase = "https://one-shot-one-night.vercel.app";
const adminTokenKey = "oneshot_admin_token";
const guestTokenKey = "oneshot_guest_token";
const guestAccessTokenPrefix = "oneshot_guest_access:";

export function apiBaseURL() {
  // Browser traffic goes through the web origin. This avoids an extra CORS
  // preflight for every authenticated API request. Direct access remains
  // available for non-browser consumers and explicit local troubleshooting.
  if (typeof window !== "undefined") return "";
  if (configuredApiBase) return configuredApiBase.replace(/\/$/, "");
  return defaultSupabaseApiBase;
}

export function functionsBaseURL() {
  return apiBaseURL().replace(/\/api$/, "");
}

export function guestURL(slug: string, accessToken: string) {
  const base = publicWebBaseURL();
  return `${base}/guest-upload/${slug}?token=${encodeURIComponent(accessToken)}`;
}

export function rememberGuestAccessToken(slug: string, token: string) {
  if (token) sessionStorage.setItem(`${guestAccessTokenPrefix}${slug}`, token);
}

export function storedGuestAccessToken(slug: string) {
  return sessionStorage.getItem(`${guestAccessTokenPrefix}${slug}`) ?? "";
}

function publicWebBaseURL(): string {
  return publicWebBase;
}

export function publicWebURL(url?: string): string {
  const base = publicWebBaseURL();
  if (!url) return base;

  try {
    const parsed = new URL(url, base);
    return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

export type EventRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  host_message?: string;
  mode: "standard_upload" | "disposable_camera" | "live_gallery" | "delayed_reveal";
  status: "open" | "locked" | "deleted";
  starts_at: string;
  ends_at: string;
  reveal_at: string;
  max_guests: number;
  max_photos_per_guest: number;
  allow_gallery_uploads: boolean;
  prefer_camera_capture: boolean;
  allow_immediate_gallery: boolean;
  auto_approve_photos: boolean;
  offline_upload_grace_hours: number;
};

export type GuestRecord = {
  id: string;
  event_id: string;
  display_name?: string;
  upload_count: number;
  message_count: number;
  created_at: string;
  last_seen_at: string;
  status: "active" | "blocked";
};

export type PhotoRecord = {
  id: string;
  guest_id?: string;
  guest_name?: string;
  object_key: string;
  public_url?: string;
  thumbnail_url?: string;
  preview_url?: string;
  width_px?: number;
  height_px?: number;
  content_type: string;
  size_bytes: number;
  message?: string;
  status: "pending" | "approved" | "hidden" | "deleted";
  is_developed: boolean;
  created_at: string;
};

export type AdminOverview = {
  events: number;
  open_events: number;
  upcoming_events: number;
  guests: number;
  photos: number;
  pending_photos: number;
  storage_bytes: number;
};

export type AdminEventSummary = {
  event: EventRecord;
  guest_count: number;
  photo_count: number;
  pending_photos: number;
  storage_bytes: number;
};

export type AdminEventDetail = {
  event: EventRecord;
  guest_url: string;
  guests: GuestRecord[];
  photos: PhotoRecord[];
  stats: AdminOverview;
};

export type GalleryResponse = {
  event: EventRecord;
  photos: PhotoRecord[];
  next_cursor?: string | null;
};

export class APIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof APIError && error.status === 401;
}

export function hasAdminToken() {
  return Boolean(localStorage.getItem(adminTokenKey));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const headers = new Headers(init?.headers);
  const method = init?.method ?? "GET";
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (path.startsWith("/api/v1/admin/") && path !== "/api/v1/admin/login") {
    const token = localStorage.getItem(adminTokenKey);
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (path.startsWith("/api/v1/guest/")) {
    headers.set("X-Guest-Token", guestDeviceToken());
  }
  try {
    res = await fetch(`${apiBaseURL()}${path}`, {
      ...init,
      headers
    });
  } catch {
    const target = apiBaseURL() || "the local Vite server";
    throw new Error(`Cannot reach the API through ${target}. Start the app with "./dev" from the project root.`);
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed", error: undefined }));
    const apiError = new APIError(error.message ?? "Request failed", res.status, error.error);
    if (res.status === 401 && path.startsWith("/api/v1/admin/") && path !== "/api/v1/admin/login") {
      window.dispatchEvent(new Event("admin-session-expired"));
    }
    throw apiError;
  }
  return (await res.json()) as T;
}

function guestDeviceToken() {
  let token = localStorage.getItem(guestTokenKey);
  if (!token) {
    token = randomID();
    localStorage.setItem(guestTokenKey, token);
  }
  return token;
}

export async function adminLogin(password: string) {
  const result = await request<{ ok: boolean; token: string; expires_at: string }>("/api/v1/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  localStorage.setItem(adminTokenKey, result.token);
  return result;
}

export async function adminLogout() {
  try {
    return await request<{ ok: boolean }>("/api/v1/admin/logout", { method: "POST" });
  } finally {
    localStorage.removeItem(adminTokenKey);
  }
}

export function adminMe() {
  return request<{ authenticated: boolean; expires_at?: string }>("/api/v1/admin/me");
}

export function adminOverview() {
  return request<AdminOverview>("/api/v1/admin/overview");
}

export function adminEvents(params?: { q?: string; status?: string }) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);
  const suffix = search.toString() ? `?${search}` : "";
  const key = suffix;
  const existing = pendingAdminEventRequests.get(key);
  if (existing) return existing;
  const pending = request<{ events: AdminEventSummary[] }>(`/api/v1/admin/events${suffix}`)
    .finally(() => pendingAdminEventRequests.delete(key));
  pendingAdminEventRequests.set(key, pending);
  return pending;
}

const pendingAdminEventRequests = new Map<string, Promise<{ events: AdminEventSummary[] }>>();

export function adminCreateEvent(payload: unknown) {
  return request<{ event: EventRecord; guest_url: string; access_token: string }>("/api/v1/admin/events", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function adminEvent(eventID: string) {
  return request<AdminEventDetail>(`/api/v1/admin/events/${eventID}`);
}

export function adminPhotoArchiveURL(eventID: string) {
  return `${apiBaseURL()}/api/v1/admin/events/${eventID}/photos/download`;
}

export async function adminDownloadPhotoArchive(eventID: string) {
  const token = localStorage.getItem(adminTokenKey);
  const response = await fetch(adminPhotoArchiveURL(eventID), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) throw new APIError("Download failed", response.status, "download_failed");
  return response.blob();
}

export function adminUpdateEvent(eventID: string, payload: unknown) {
  return request<{ event: EventRecord }>(`/api/v1/admin/events/${eventID}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function adminResetEventTokens(eventID: string) {
  return request<{ event: EventRecord; guest_url: string; access_token: string }>(`/api/v1/admin/events/${eventID}/tokens/reset`, {
    method: "POST"
  });
}

export function adminSetEventStatus(eventID: string, status: "open" | "locked" | "deleted") {
  const path = status === "open" ? "open" : status === "locked" ? "lock" : "";
  if (path) {
    return request<{ event: EventRecord }>(`/api/v1/admin/events/${eventID}/${path}`, { method: "POST" });
  }
  return request<{ event: EventRecord }>(`/api/v1/admin/events/${eventID}`, { method: "DELETE" });
}

export function adminModeratePhoto(eventID: string, photoID: string, status: PhotoRecord["status"]) {
  return request<{ status: string }>(`/api/v1/admin/events/${eventID}/photos/${photoID}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function adminUpdateGuest(eventID: string, guestID: string, status: GuestRecord["status"]) {
  return request<{ guest: GuestRecord }>(`/api/v1/admin/events/${eventID}/guests/${guestID}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function joinGuest(slug: string, accessToken: string, displayName: string) {
  return request<{ event: EventRecord; guest_name: string; remaining_shots: number; gallery_available: boolean }>(`/api/v1/guest/${slug}/join`, {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken, display_name: displayName })
  });
}

export async function uploadGuestPhoto(slug: string, accessToken: string, file: File, message: string, displayName = "") {
  const prepared = await prepareGuestPhoto(slug, accessToken, file, displayName);
  await putGuestPhoto(prepared, file, slug, accessToken);
  return completeGuestPhoto(slug, accessToken, prepared, message, displayName);
}

type PreparedGuestPhoto = {
  photo_id: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  resumable_url?: string;
  upload_signature?: string;
  object_key: string;
  upload_token: string;
  dimensions: { width: number; height: number } | null;
};

async function prepareGuestPhoto(slug: string, accessToken: string, file: File, displayName: string): Promise<PreparedGuestPhoto> {
  const contentType = file.type || contentTypeFromFileName(file.name);
  const dimensions = await imageDimensions(file);
  const presign = await request<{ photo_id: string; object_key: string; upload_url: string; upload_headers: Record<string, string>; resumable_url?: string; upload_signature?: string; upload_token: string; remaining_shots: number }>(
    `/api/v1/guest/${slug}/uploads/presign`,
    {
      method: "POST",
      headers: { "Idempotency-Key": randomID() },
      body: JSON.stringify({
        access_token: accessToken,
        file_name: file.name,
        content_type: contentType,
        size_bytes: file.size,
        width_px: dimensions?.width,
        height_px: dimensions?.height,
        display_name: displayName.trim()
      })
    }
  );

  return { ...presign, dimensions };
}

async function putGuestPhoto(prepared: PreparedGuestPhoto, file: File, slug: string, accessToken: string, onProgress?: (loaded: number) => void) {
  const tus = await import("tus-js-client");
  const directUpload = Boolean(prepared.resumable_url && prepared.upload_signature);
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: directUpload ? prepared.resumable_url! : `${apiBaseURL()}/api/v1/guest/${encodeURIComponent(slug)}/uploads/resumable/${prepared.photo_id}`,
      headers: directUpload
        ? { "x-signature": prepared.upload_signature! }
        : { Authorization: `Bearer ${accessToken}`, "X-Guest-Token": guestDeviceToken() },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        filename: file.name,
        filetype: file.type || "application/octet-stream",
        ...(directUpload ? {
          bucketName: "oneshotonenight",
          objectName: prepared.object_key,
          contentType: file.type || contentTypeFromFileName(file.name),
          cacheControl: "3600"
        } : {})
      },
      onProgress: (bytesUploaded) => onProgress?.(bytesUploaded),
      onError: (error) => reject(new APIError(error.message || "Upload failed", 0, "upload_failed")),
      onSuccess: () => {
        onProgress?.(file.size);
        resolve();
      }
    });
    void upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch(reject);
  });
}

function completeGuestPhoto(slug: string, accessToken: string, prepared: PreparedGuestPhoto, message: string, displayName: string) {
  return request<{ photo: PhotoRecord; remaining_shots: number }>(`/api/v1/guest/${slug}/photos`, {
    method: "POST",
    body: JSON.stringify({
      access_token: accessToken,
      photo_id: prepared.photo_id,
      upload_token: prepared.upload_token,
      width_px: prepared.dimensions?.width,
      height_px: prepared.dimensions?.height,
      display_name: displayName.trim(),
      message
    })
  });
}

export async function uploadGuestPhotos(
  slug: string,
  accessToken: string,
  files: File[],
  displayName: string,
  onResult: (file: File, result: { ok: boolean; message: string; remaining_shots?: number }) => void,
  onProgress?: (progress: { file: File; loaded: number; total: number; percent: number }) => void
) {
  const prepared: Array<{ file: File; upload: PreparedGuestPhoto }> = [];
  for (const file of files) {
    try {
      prepared.push({ file, upload: await prepareGuestPhoto(slug, accessToken, file, displayName) });
    } catch (error) {
      onResult(file, { ok: false, message: error instanceof Error ? error.message : "Upload failed" });
    }
  }

  const loadedByFile = new Map<File, number>();
  const totalBytes = prepared.reduce((total, item) => total + item.file.size, 0);
  const workers = Array.from({ length: Math.min(3, prepared.length) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < prepared.length; index += 3) {
      const item = prepared[index];
      try {
        await putGuestPhoto(item.upload, item.file, slug, accessToken, (loaded) => {
          loadedByFile.set(item.file, loaded);
          const totalLoaded = [...loadedByFile.values()].reduce((total, value) => total + value, 0);
          onProgress?.({ file: item.file, loaded: totalLoaded, total: totalBytes, percent: totalBytes ? Math.round((totalLoaded / totalBytes) * 100) : 0 });
        });
      } catch (error) {
        onResult(item.file, { ok: false, message: error instanceof Error ? error.message : "Upload failed" });
        prepared[index] = { ...item, upload: { ...item.upload, upload_token: "" } };
      }
    }
  });
  await Promise.all(workers);

  let remainingShots: number | undefined;
  for (const item of prepared) {
    if (!item.upload.upload_token) continue;
    try {
      const result = await completeGuestPhoto(slug, accessToken, item.upload, "", displayName);
      remainingShots = result.remaining_shots;
      onResult(item.file, { ok: true, message: "Uploaded", remaining_shots: result.remaining_shots });
    } catch (error) {
      onResult(item.file, { ok: false, message: error instanceof Error ? error.message : "Upload failed" });
    }
  }
  return { remaining_shots: remainingShots };
}

async function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to decode image dimensions"));
    });
    image.src = url;
    await loaded;
    return image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function randomID() {
  const webCrypto = globalThis.crypto;
  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }
  if (!webCrypto?.getRandomValues) {
    throw new APIError("Secure browser crypto is required for uploads.", 400, "crypto_unavailable");
  }
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function contentTypeFromFileName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

export function guestGallery(slug: string, accessToken: string, options?: { before?: string | null; limit?: number }) {
  const search = new URLSearchParams();
  if (options?.before) search.set("before", options.before);
  if (options?.limit) search.set("limit", String(options.limit));
  const suffix = search.toString() ? `?${search}` : "";
  return request<GalleryResponse>(`/api/v1/gallery/${slug}${suffix}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
