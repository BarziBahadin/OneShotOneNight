const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const adminCreateToken = import.meta.env.VITE_ADMIN_CREATE_TOKEN;
const configuredPublicWebURL = import.meta.env.VITE_PUBLIC_WEB_URL;

export function apiBaseURL() {
  if (configuredApiBase) return configuredApiBase.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const apiOverride = new URLSearchParams(window.location.search).get("api");
    if (apiOverride) {
      return apiOverride.replace(/\/$/, "");
    }
    window.localStorage.removeItem("oneshotonenight_api_base");
    return "";
  }
  return "";
}

export function guestURL(slug: string, accessToken: string) {
  const base = publicWebURL();
  return `${base}/guest/${slug}?t=${encodeURIComponent(accessToken)}`;
}

export function publicWebURL(url?: string) {
  const configured = configuredPublicWebURL?.replace(/\/$/, "");
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const base = configured || browserOrigin || "http://localhost:3000";
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseURL()}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
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

export function createEvent(payload: unknown) {
  return request<{ event: EventRecord; guest_url: string; access_token: string; organizer_token: string }>("/api/v1/events", {
    method: "POST",
    headers: adminCreateToken ? { Authorization: `Bearer ${adminCreateToken}` } : undefined,
    body: JSON.stringify(payload)
  });
}

export function adminLogin(password: string) {
  return request<{ ok: boolean; expires_at: string }>("/api/v1/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export function adminLogout() {
  return request<{ ok: boolean }>("/api/v1/admin/logout", { method: "POST" });
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
  return request<{ event: EventRecord; guest_url: string; access_token: string; organizer_token: string }>("/api/v1/admin/events", {
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

export function adminUpdateEvent(eventID: string, payload: unknown) {
  return request<{ event: EventRecord }>(`/api/v1/admin/events/${eventID}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
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

export function presignUpload(slug: string, accessToken: string, file: File) {
  return request<{ photo_id: string; object_key: string; upload_url: string; upload_token: string; remaining_shots: number }>(`/api/v1/guest/${slug}/uploads/presign`, {
    method: "POST",
    headers: { "Idempotency-Key": randomID() },
    body: JSON.stringify({ access_token: accessToken, file_name: file.name, content_type: file.type, size_bytes: file.size })
  });
}

export function registerPhoto(slug: string, accessToken: string, payload: Record<string, unknown>) {
  return request<{ photo: PhotoRecord; remaining_shots: number }>(`/api/v1/guest/${slug}/photos`, {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken, ...payload })
  });
}

export function guestGallery(slug: string, accessToken: string) {
  return request<{ event: EventRecord; photos: PhotoRecord[] }>(`/api/v1/gallery/${slug}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export function hostPhotos(slug: string, organizerToken: string) {
  return request<{ event: EventRecord; photos: PhotoRecord[] }>(`/api/v1/host/events/${slug}/photos`, {
    headers: { Authorization: `Bearer ${organizerToken}` }
  });
}

export function moderatePhoto(eventID: string, photoID: string, organizerToken: string, status: PhotoRecord["status"]) {
  return request<{ status: string }>(`/api/v1/host/events/${eventID}/photos/${photoID}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ status })
  });
}

function randomID() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
