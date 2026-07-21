const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const defaultSupabaseApiBase = "https://huakafctiajezinrzfle.supabase.co/functions/v1/api";
const publicWebBase = import.meta.env.VITE_PUBLIC_WEB_URL || "https://one-shot-one-night.vercel.app";
const adminTokenKey = "oneshot_admin_token";
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
  return `${base}/gallery/${slug}?token=${encodeURIComponent(accessToken)}`;
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
  cover_url?: string | null;
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

export async function adminUploadEventCover(eventID: string, file: File) {
  const presign = await request<{
    object_key: string;
    upload_url: string;
    upload_headers: Record<string, string>;
  }>(`/api/v1/admin/events/${eventID}/cover/presign`, {
    method: "POST",
    body: JSON.stringify({ content_type: file.type, size_bytes: file.size })
  });

  const upload = await fetch(presign.upload_url, {
    method: "PUT",
    headers: presign.upload_headers,
    body: file
  });
  if (!upload.ok) throw new APIError("Cover photo upload failed", upload.status, "cover_upload_failed");

  return request<{ event: EventRecord }>(`/api/v1/admin/events/${eventID}/cover`, {
    method: "POST",
    body: JSON.stringify({ object_key: presign.object_key, content_type: file.type, size_bytes: file.size })
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

export function guestGallery(slug: string, accessToken: string, options?: { before?: string | null; limit?: number }) {
  const search = new URLSearchParams();
  if (options?.before) search.set("before", options.before);
  if (options?.limit) search.set("limit", String(options.limit));
  const suffix = search.toString() ? `?${search}` : "";
  return request<GalleryResponse>(`/api/v1/gallery/${slug}${suffix}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
