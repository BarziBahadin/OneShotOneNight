import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

export const bucket = "oneshotonenight";
const webOrigin = new URL(Deno.env.get("PUBLIC_WEB_URL") || "https://one-shot-one-night.vercel.app").origin;

export const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm"
]);

export const cors = {
  "Access-Control-Allow-Origin": webOrigin,
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key, x-guest-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

export class HTTPError extends Error {
  constructor(public status: number, message: string, public code = "request_failed") {
    super(message);
  }
}

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function config(client: SupabaseClient) {
  const { data, error } = await client.from("app_config").select("token_pepper").eq("id", true).single();
  if (error || !data) throw error || new Error("Missing app config");
  return data;
}

export async function validGuestUploadEvent(client: SupabaseClient, slug: string, token: string) {
  const { data, error } = await client
    .from("events")
    .select("id,slug,name,title,description,host_message,status,max_photos_per_guest,auto_approve_photos,access_token_hash,guest_upload_enabled,guest_upload_token_hash")
    .eq("slug", slug)
    .neq("status", "deleted")
    .single();

  if (error || !data) throw new HTTPError(404, "Event not found", "not_found");
  if (data.status !== "open" || !data.guest_upload_enabled) {
    throw new HTTPError(403, "Guest uploads are not enabled for this event", "guest_upload_disabled");
  }

  const cfg = await config(client);
  const expectedHash = data.guest_upload_token_hash || data.access_token_hash;
  if (!token || !safeEqual(expectedHash, await tokenHash(token, cfg.token_pepper))) {
    throw new HTTPError(401, "Unauthorized", "unauthorized");
  }

  delete data.access_token_hash;
  delete data.guest_upload_token_hash;
  return data;
}

export async function bodyJSON(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export function errorResponse(error: unknown) {
  console.error(error);
  const e = error instanceof HTTPError ? error : new HTTPError(500, "Internal server error", "internal_error");
  return json({ message: e.message, error: e.code }, e.status);
}

export function id26() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 26).toUpperCase();
}

export function mediaType(contentType: string) {
  if (contentType.startsWith("image/")) return "photo";
  if (contentType.startsWith("video/")) return "video";
  throw new HTTPError(400, "Unsupported media type", "validation_error");
}

export function extension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic") return "heic";
  if (type === "image/heif") return "heif";
  if (type === "video/mp4") return "mp4";
  if (type === "video/quicktime") return "mov";
  if (type === "video/webm") return "webm";
  return "jpg";
}

export function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7) : "";
}

export function cleanName(value: unknown) {
  const name = String(value || "").trim().slice(0, 100);
  if (!name) throw new HTTPError(400, "Guest name is required", "validation_error");
  return name;
}

export function cleanMessage(value: unknown) {
  return String(value || "").trim().slice(0, 500);
}

export function cleanFileName(value: unknown, fallback: string) {
  return String(value || fallback).trim().replace(/[^\w.\- ()]/g, "_").slice(0, 255) || fallback;
}

export function positiveSize(value: unknown) {
  const size = Number(value);
  if (!Number.isInteger(size) || size <= 0 || size > 104857600) {
    throw new HTTPError(400, "Invalid file size", "validation_error");
  }
  return size;
}

export async function verifyStoredObject(
  client: SupabaseClient,
  storagePath: string,
  expectedSize: number,
  expectedType: string
) {
  const separator = storagePath.lastIndexOf("/");
  const folder = separator >= 0 ? storagePath.slice(0, separator) : "";
  const fileName = separator >= 0 ? storagePath.slice(separator + 1) : storagePath;
  const { data, error } = await client.storage.from(bucket).list(folder, { limit: 2, search: fileName });
  if (error) throw error;
  const object = (data || []).find((item) => item.name === fileName);
  if (!object) throw new HTTPError(400, "Uploaded file was not found in storage", "upload_missing");
  const metadata = (object.metadata || {}) as Record<string, unknown>;
  const actualSize = Number(metadata.size ?? 0);
  const actualType = String(metadata.mimetype ?? metadata.contentType ?? "").toLowerCase();
  if (actualSize !== Number(expectedSize)) {
    throw new HTTPError(400, "Uploaded file size does not match the upload request", "upload_size_mismatch");
  }
  if (actualType && actualType !== expectedType.toLowerCase()) {
    throw new HTTPError(400, "Uploaded file type does not match the upload request", "upload_type_mismatch");
  }
}

export async function tokenHash(token: string, pepper: string) {
  return sha256(`${pepper}:${token}`);
}

function adminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const key = keys.default || Object.values(keys)[0];
  if (!key) throw new Error("Supabase server key is unavailable");
  return String(key);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
