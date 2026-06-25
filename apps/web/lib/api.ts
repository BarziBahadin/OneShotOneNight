const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const defaultSupabaseApiBase = "https://huakafctiajezinrzfle.supabase.co/functions/v1/api";
const publicWebBase = "https://one-shot-one-night.vercel.app";
const adminTokenKey = "oneshot_admin_token";
const guestTokenKey = "oneshot_guest_token";
const guestAccessTokenPrefix = "oneshot_guest_access:";

export function apiBaseURL() {
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
  object_key: string;
  public_url?: string;
  thumbnail_url?: string;
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
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = init?.method ?? "GET";
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
  return request<{ events: AdminEventSummary[] }>(`/api/v1/admin/events${suffix}`);
}

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
  return request<{ event: EventRecord; remaining_shots: number; gallery_available: boolean }>(`/api/v1/guest/${slug}/join`, {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken, display_name: displayName })
  });
}

export async function uploadGuestPhoto(slug: string, accessToken: string, file: File, message: string) {
  const contentType = file.type || contentTypeFromFileName(file.name);
  const session = await invokeFunction<{
    upload_session: { id: string; status: string };
    remaining_shots: number;
    upload_urls: Array<{
      media_id: string;
      file_name: string;
      file_type: string;
      file_size: number;
      media_type: "photo" | "video";
      storage_path: string;
      upload_url: string;
      upload_headers: Record<string, string>;
    }>;
  }>("create-guest-upload-session", {
    event_slug: slug,
    token: accessToken,
    guest_name: "Guest",
    guest_message: message,
    files: [
      {
        file_name: file.name,
        file_type: contentType,
        file_size: file.size
      }
    ]
  });
  const uploadTarget = session.upload_urls[0];
  if (!uploadTarget) throw new APIError("Upload session did not return a signed URL.", 500, "missing_upload_url");

  const uploaded = await fetch(uploadTarget.upload_url, {
    method: "PUT",
    headers: uploadTarget.upload_headers,
    body: file
  });
  if (!uploaded.ok) {
    throw new APIError("Upload failed", uploaded.status, "upload_failed");
  }

  const complete = await invokeFunction<{ upload_session: { id: string; status: string }; media: unknown[] }>("complete-guest-upload", {
    event_slug: slug,
    token: accessToken,
    upload_session_id: session.upload_session.id,
    uploaded_files: [
      {
        media_id: uploadTarget.media_id,
        file_name: uploadTarget.file_name,
        file_type: uploadTarget.file_type,
        file_size: file.size,
        storage_path: uploadTarget.storage_path
      }
    ]
  });
  return { media: complete.media, remaining_shots: session.remaining_shots };
}

async function invokeFunction<T>(name: string, payload: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${functionsBaseURL()}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error(`Cannot reach the Supabase Edge Function ${name}.`);
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed", error: undefined }));
    throw new APIError(error.message ?? "Request failed", res.status, error.error);
  }
  return (await res.json()) as T;
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
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov") || lower.endsWith(".qt")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  return "image/jpeg";
}

export function guestGallery(slug: string, accessToken: string) {
  return request<{ event: EventRecord; photos: PhotoRecord[] }>(`/api/v1/gallery/${slug}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
