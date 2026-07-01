import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import JSZip from "npm:jszip@3.10.1";

const bucket = "oneshotonenight";
const eventColumns = "id,slug,name,description,host_message,mode,status,starts_at,ends_at,reveal_at,max_guests,max_photos_per_guest,allow_gallery_uploads,prefer_camera_capture,allow_immediate_gallery,auto_approve_photos,offline_upload_grace_hours,created_at,updated_at";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "video/mp4", "video/quicktime", "video/webm"]);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key, x-guest-token, tus-resumable, upload-length, upload-offset, upload-metadata, upload-defer-length, upload-checksum", "Access-Control-Allow-Methods": "GET, HEAD, POST, PATCH, DELETE, OPTIONS", "Access-Control-Expose-Headers": "location, tus-resumable, upload-offset, upload-length, upload-expires" };

class HTTPError extends Error { constructor(public status: number, message: string, public code = "request_failed") { super(message); } }

function adminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const key = keys.default || Object.values(keys)[0];
  if (!key) throw new Error("Supabase server key is unavailable");
  return String(key);
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    return await route(req, db);
  } catch (error) {
    console.error(error);
    const e = error instanceof HTTPError ? error : new HTTPError(500, "Internal server error", "internal_error");
    return json({ message: e.message, error: e.code }, e.status);
  }
});

async function route(req: Request, client: SupabaseClient) {
  const url = new URL(req.url);
  const marker = "/functions/v1/api";
  let path = url.pathname.startsWith(marker) ? url.pathname.slice(marker.length) : url.pathname;
  if (path.startsWith("/api/api/")) path = path.slice(4);
  if (!path.startsWith("/api/")) path = `/api${path}`;
  const parts = path.split("/").filter(Boolean);
  if (path === "/api/v1/health" || path === "/healthz") return json({ ok: "true" });
  if (parts[0] !== "api" || parts[1] !== "v1") throw new HTTPError(404, "Not found", "not_found");

  if (parts[2] === "admin") return adminRoute(req, url, parts.slice(3), client);
  if (parts[2] === "guest") return guestRoute(req, parts.slice(3), client);
  if (parts[2] === "gallery") return galleryRoute(req, parts[3], client);
  throw new HTTPError(404, "Not found", "not_found");
}

async function config(client: SupabaseClient) {
  const { data, error } = await client.from("app_config").select("admin_password_hash,token_pepper").eq("id", true).single();
  if (error || !data) throw error || new Error("Missing app config");
  return data;
}

async function adminRoute(req: Request, url: URL, parts: string[], client: SupabaseClient) {
  const action = parts[0] || "";
  if (action === "login" && req.method === "POST") {
    const body = await bodyJSON(req);
    const cfg = await config(client);
    if (!safeEqual(await sha256(String(body.password || "")), cfg.admin_password_hash)) throw new HTTPError(401, "Unauthorized", "unauthorized");
    const token = randomToken();
    const expires = new Date(Date.now() + 12 * 3600_000).toISOString();
    const { error } = await client.from("admin_sessions").insert({ id: await tokenHash(token, cfg.token_pepper), expires_at: expires });
    if (error) throw error;
    return json({ ok: true, token, expires_at: expires });
  }
  if (action === "me") {
    const session = await adminSession(req, client, false);
    return json(session ? { authenticated: true, expires_at: session.expires_at } : { authenticated: false });
  }
  const session = await adminSession(req, client, true);
  if (action === "logout" && req.method === "POST") {
    await client.from("admin_sessions").delete().eq("id", session!.id);
    return json({ ok: true });
  }
  if (action === "overview" && req.method === "GET") return json(await overview(client));
  if (action !== "events") throw new HTTPError(404, "Not found", "not_found");

  if (!parts[1]) {
    if (req.method === "GET") {
      const { data, error } = await client.from("events").select(eventColumns).neq("status", "deleted").order("created_at", { ascending: false });
      if (error) throw error;
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const status = url.searchParams.get("status") || "";
      const events = (data || []).filter((e) => (!q || e.name.toLowerCase().includes(q) || e.slug.includes(q)) && (!status || e.status === status));
      const summaries = await Promise.all(events.map(async (event) => ({ event, ...(await eventStats(client, event.id)) })));
      return json({ events: summaries });
    }
    if (req.method === "POST") return createEvent(req, client);
  }

  const eventID = parts[1];
  if (!eventID) throw new HTTPError(404, "Not found", "not_found");
  if (!parts[2]) {
    if (req.method === "GET") return json(await eventDetail(client, eventID));
    if (req.method === "PATCH") {
      const body = await bodyJSON(req);
      const allowed = ["name","description","mode","status","starts_at","ends_at","reveal_at","max_guests","max_photos_per_guest","allow_gallery_uploads","prefer_camera_capture","allow_immediate_gallery","auto_approve_photos","offline_upload_grace_hours"];
      const update = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
      update.updated_at = new Date().toISOString();
      const { data, error } = await client.from("events").update(update).eq("id", eventID).select(eventColumns).single();
      if (error) throw error;
      return json({ event: data });
    }
    if (req.method === "DELETE") return setEventStatus(client, eventID, "deleted");
  }
  if (parts[2] === "open" && req.method === "POST") return setEventStatus(client, eventID, "open");
  if (parts[2] === "lock" && req.method === "POST") return setEventStatus(client, eventID, "locked");
  if (parts[2] === "tokens" && parts[3] === "reset" && req.method === "POST") {
    const cfg = await config(client); const version = `v2:${randomToken()}`; const token = await deriveAccessToken(eventID, version, cfg.token_pepper);
    const token_hash = await tokenHash(token, cfg.token_pepper);
    const { data, error } = await client.from("events").update({ access_token_version: version, access_token_hash: token_hash, guest_upload_token_hash: token_hash, updated_at: new Date().toISOString() }).eq("id", eventID).select(eventColumns).single();
    if (error) throw error;
    return json({ event: data, access_token: token, guest_url: guestURL(data.slug, token) });
  }
  if (parts[2] === "photos" && parts[3] === "download" && req.method === "GET") return photoArchive(client, eventID);
  if (parts[2] === "photos" && parts[3] && req.method === "PATCH") {
    const body = await bodyJSON(req);
    if (!["pending","approved","hidden","deleted"].includes(body.status)) throw new HTTPError(400, "Invalid photo status", "validation_error");
    const { error } = await client.from("photos").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", parts[3]).eq("event_id", eventID);
    if (error) throw error; return json({ status: body.status });
  }
  if (parts[2] === "guests" && parts[3] && req.method === "PATCH") {
    const body = await bodyJSON(req);
    if (!["active","blocked"].includes(body.status)) throw new HTTPError(400, "Invalid guest status", "validation_error");
    const { data, error } = await client.from("guests").update({ status: body.status, last_seen_at: new Date().toISOString() }).eq("id", parts[3]).eq("event_id", eventID).select("id,event_id,display_name,upload_count,message_count,created_at,last_seen_at,status").single();
    if (error) throw error; return json({ guest: data });
  }
  throw new HTTPError(404, "Not found", "not_found");
}

async function createEvent(req: Request, client: SupabaseClient) {
  const body = await bodyJSON(req); const name = String(body.name || "").trim();
  if (!name) throw new HTTPError(400, "Event name is required", "validation_error");
  const now = new Date(); const starts = body.starts_at || now.toISOString(); const ends = body.ends_at || new Date(now.getTime() + 12 * 3600_000).toISOString(); const reveal = body.reveal_at || ends;
  const id = id26(); const slug = `${slugify(name)}-${id.slice(-6).toLowerCase()}`; const cfg = await config(client); const version = `v2:${randomToken()}`; const token = await deriveAccessToken(id, version, cfg.token_pepper);
  const token_hash = await tokenHash(token, cfg.token_pepper);
  const description = String(body.description || "").trim();
  const row = { id, slug, name, title: name, description, host_message: description, access_token_hash: token_hash, guest_upload_token_hash: token_hash, guest_upload_enabled: true, access_token_version: version, organizer_token_hash: "", guest_url: "", mode: body.mode || "delayed_reveal", status: "open", starts_at: starts, ends_at: ends, reveal_at: reveal, max_guests: body.max_guests || 250, max_photos_per_guest: body.max_photos_per_guest || 12, allow_gallery_uploads: body.allow_gallery_uploads ?? true, prefer_camera_capture: body.prefer_camera_capture ?? true, allow_immediate_gallery: body.allow_immediate_gallery ?? false, auto_approve_photos: body.auto_approve_photos ?? true, offline_upload_grace_hours: body.offline_upload_grace_hours ?? 24 };
  const { data, error } = await client.from("events").insert(row).select(eventColumns).single();
  if (error) throw adminDatabaseError(error);
  return json({ event: data, access_token: token, guest_url: guestURL(slug, token) }, 201);
}

async function setEventStatus(client: SupabaseClient, id: string, status: string) {
  const { data, error } = await client.from("events").update({ status, guest_upload_enabled: status === "open", updated_at: new Date().toISOString() }).eq("id", id).select(eventColumns).single();
  if (error) throw error; return json({ event: data });
}

async function adminSession(req: Request, client: SupabaseClient, required: boolean) {
  const raw = bearer(req); if (!raw) { if (required) throw new HTTPError(401, "Unauthorized", "unauthorized"); return null; }
  const cfg = await config(client); const id = await tokenHash(raw, cfg.token_pepper);
  const { data } = await client.from("admin_sessions").select("id,expires_at,created_at").eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!data && required) throw new HTTPError(401, "Unauthorized", "unauthorized"); return data;
}

async function overview(client: SupabaseClient) {
  const now = new Date().toISOString();
  const [events, open, upcoming, guests, photos, pending, bytes, media, pendingMedia, mediaBytes] = await Promise.all([
    count(client, "events", (q) => q.neq("status", "deleted")), count(client, "events", (q) => q.eq("status", "open")), count(client, "events", (q) => q.gt("starts_at", now).neq("status", "deleted")), count(client, "guests"), count(client, "photos", (q) => q.neq("status", "deleted")), count(client, "photos", (q) => q.eq("status", "pending")), client.from("photos").select("size_bytes").neq("status", "deleted"), count(client, "event_media", (q) => q.eq("upload_status", "uploaded").neq("approval_status", "hidden")), count(client, "event_media", (q) => q.eq("approval_status", "pending")), client.from("event_media").select("file_size").eq("upload_status", "uploaded").neq("approval_status", "hidden")
  ]);
  return { events, open_events: open, upcoming_events: upcoming, guests, photos: photos + media, pending_photos: pending + pendingMedia, storage_bytes: (bytes.data || []).reduce((n, p) => n + Number(p.size_bytes), 0) + (mediaBytes.data || []).reduce((n, p) => n + Number(p.file_size), 0) };
}

async function count(client: SupabaseClient, table: string, alter: (q: any) => any = (q) => q) { const { count, error } = await alter(client.from(table).select("*", { count: "exact", head: true })); if (error) throw error; return count || 0; }
async function eventStats(client: SupabaseClient, id: string) {
  const [guest_count, photo_count, pending_photos, sizes, media_count, pending_media, media_sizes] = await Promise.all([
    count(client, "guests", (q) => q.eq("event_id", id)),
    count(client, "photos", (q) => q.eq("event_id", id).neq("status", "deleted")),
    count(client, "photos", (q) => q.eq("event_id", id).eq("status", "pending")),
    client.from("photos").select("size_bytes").eq("event_id", id).neq("status", "deleted"),
    count(client, "event_media", (q) => q.eq("event_id", id).eq("upload_status", "uploaded").neq("approval_status", "hidden")),
    count(client, "event_media", (q) => q.eq("event_id", id).eq("approval_status", "pending")),
    client.from("event_media").select("file_size").eq("event_id", id).eq("upload_status", "uploaded").neq("approval_status", "hidden")
  ]);
  return {
    guest_count,
    photo_count: photo_count + media_count,
    pending_photos: pending_photos + pending_media,
    storage_bytes: (sizes.data || []).reduce((n, p) => n + Number(p.size_bytes), 0) + (media_sizes.data || []).reduce((n, p) => n + Number(p.file_size), 0)
  };
}

async function eventDetail(client: SupabaseClient, id: string) {
  const [{ data: event, error }, { data: guests }, { data: photos }, { data: media }, stats] = await Promise.all([
    client.from("events").select(`${eventColumns},access_token_version`).eq("id", id).single(),
    client.from("guests").select("id,event_id,display_name,upload_count,message_count,created_at,last_seen_at,status").eq("event_id", id).order("created_at"),
    client.from("photos").select(photoColumns()).eq("event_id", id).neq("status", "deleted").order("created_at", { ascending: false }),
    client.from("event_media").select(mediaColumns()).eq("event_id", id).eq("upload_status", "uploaded").neq("approval_status", "hidden").order("created_at", { ascending: false }),
    eventStats(client, id)
  ]);
  if (error) throw error;
  const token = await ensureEventToken(client, event);
  delete event.access_token_version;
  const dashboardPhotos: any[] = [...((photos || []) as any[]), ...mapEventMedia((media || []) as any[])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return {
    event,
    guest_url: guestURL(event.slug, token),
    guests: guests || [],
    photos: await signedPhotos(client, await withGuestNames(client, dashboardPhotos)),
    stats: { events: 1, open_events: event.status === "open" ? 1 : 0, upcoming_events: 0, guests: stats.guest_count, photos: stats.photo_count, pending_photos: stats.pending_photos, storage_bytes: stats.storage_bytes }
  };
}

async function guestRoute(req: Request, parts: string[], client: SupabaseClient) {
  const slug = parts[0]; const action = parts[1]; const isResumable = action === "uploads" && parts[2] === "resumable"; const body = isResumable ? {} : await bodyJSON(req); const event = await validEvent(client, slug, String(body.access_token || bearer(req) || ""));
  if (event.status !== "open") throw new HTTPError(403,"Event is not open","event_locked");
  const displayName = String(body.display_name || "").trim();
  const isPresign = action === "uploads" && parts[2] === "presign" && req.method === "POST";
  const guest = await findOrCreateGuest(client,event,req,displayName,isPresign);
  if (guest?.status === "blocked") throw new HTTPError(403,"Guest is blocked","guest_blocked");
  if (action === "join" && req.method === "POST") return json({event,guest_name:guest?.display_name || "",remaining_shots:Math.max(0,event.max_photos_per_guest-(guest?.upload_count || 0)),gallery_available:galleryAvailable(event)});
  if (!guest) throw new HTTPError(400,"Guest name is required","guest_name_required");
  if (isResumable && parts[3]) return resumableUploadProxy(req, client, guest.id, parts[3]);
  if (action === "uploads" && parts[2] === "presign" && req.method === "POST") {
    if (!displayName) throw new HTTPError(400,"Guest name is required","guest_name_required");
    if (!allowedTypes.has(body.content_type) || body.size_bytes <= 0 || body.size_bytes > 104857600) throw new HTTPError(400,"Invalid upload","validation_error");
    if (guest.upload_count >= event.max_photos_per_guest) throw new HTTPError(409,"Photo limit reached","upload_limit");
    const photoID=id26(), ext=extension(body.content_type), objectKey=`events/${event.id}/pending/${photoID}.${ext}`, uploadToken=randomToken();
    const {data,error}=await client.storage.from(bucket).createSignedUploadUrl(objectKey); if(error||!data?.token)throw error||new HTTPError(502,"Storage did not issue an upload signature","storage_error");
    const cfg=await config(client); await client.from("upload_intents").insert({photo_id:photoID,event_id:event.id,guest_id:guest.id,object_key:objectKey,content_type:body.content_type,size_bytes:body.size_bytes,token_hash:await tokenHash(uploadToken,cfg.token_pepper),expires_at:new Date(Date.now()+24*60*60_000).toISOString()});
    return json({photo_id:photoID,object_key:objectKey,upload_url:data.signedUrl,upload_headers:{"Content-Type":body.content_type},resumable_url:`${storageBaseURL()}/storage/v1/upload/resumable/sign`,upload_signature:data.token,upload_token:uploadToken,remaining_shots:event.max_photos_per_guest-guest.upload_count});
  }
  if (action === "photos" && req.method === "POST") {
    const cfg=await config(client); const {data:intent}=await client.from("upload_intents").select("*").eq("photo_id",body.photo_id).eq("guest_id",guest.id).eq("used",false).gt("expires_at",new Date().toISOString()).maybeSingle();
    if(!intent||!safeEqual(intent.token_hash,await tokenHash(String(body.upload_token||""),cfg.token_pepper)))throw new HTTPError(403,"Invalid upload token","forbidden");
    if (guest.upload_count >= event.max_photos_per_guest) throw new HTTPError(409,"Photo limit reached","upload_limit");
    const status=event.auto_approve_photos?"approved":"pending"; const now=new Date().toISOString();
    const width_px=positiveInt(body.width_px),height_px=positiveInt(body.height_px);
    const {data:photo,error}=await client.from("photos").insert({id:intent.photo_id,event_id:event.id,guest_id:guest.id,object_key:intent.object_key,content_type:intent.content_type,size_bytes:intent.size_bytes,message:String(body.message||"").slice(0,500),status,is_developed:event.mode!=="disposable_camera",width_px,height_px,created_at:now,updated_at:now}).select(photoColumns()).single(); if(error)throw error;
    await Promise.all([client.from("upload_intents").update({used:true}).eq("photo_id",intent.photo_id),client.from("guests").update({upload_count:guest.upload_count+1,last_seen_at:now}).eq("id",guest.id)]);
    return json({photo:{...(photo as any),guest_name:guest.display_name},remaining_shots:Math.max(0,event.max_photos_per_guest-guest.upload_count-1)},201);
  }
  throw new HTTPError(404,"Not found","not_found");
}

async function resumableUploadProxy(req:Request,client:SupabaseClient,guestID:string,photoID:string){
  const {data:intent,error}=await client.from("upload_intents").select("photo_id,guest_id,object_key,content_type,size_bytes,resumable_url,expires_at,used").eq("photo_id",photoID).eq("guest_id",guestID).eq("used",false).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(error)throw error;if(!intent)throw new HTTPError(404,"Upload session not found","upload_not_found");
  const creating=req.method==="POST";if(!creating&&!intent.resumable_url)throw new HTTPError(409,"Upload has not started","upload_not_started");
  const upstream=creating?`${storageBaseURL()}/storage/v1/upload/resumable`:String(intent.resumable_url);
  const allowedOrigin=new URL(storageBaseURL()).origin;const parsedUpstream=new URL(upstream);
  if(parsedUpstream.origin!==allowedOrigin||!parsedUpstream.pathname.startsWith("/storage/v1/upload/resumable"))throw new HTTPError(400,"Invalid upload session","validation_error");
  const key=adminKey();const headers=new Headers();headers.set("Authorization",`Bearer ${key}`);headers.set("apikey",key);headers.set("Tus-Resumable",req.headers.get("Tus-Resumable")||"1.0.0");
  for(const name of ["Upload-Length","Upload-Offset","Upload-Defer-Length","Upload-Checksum","Content-Type"]){const value=req.headers.get(name);if(value)headers.set(name,value);}
  if(creating){headers.set("Upload-Length",String(intent.size_bytes));headers.set("Upload-Metadata",tusMetadata({bucketName:bucket,objectName:intent.object_key,contentType:intent.content_type,cacheControl:"3600"}));}
  const response=await fetch(upstream,{method:req.method,headers,body:["POST","PATCH"].includes(req.method)?req.body:undefined,redirect:"manual"});
  if(creating&&response.ok){const location=response.headers.get("location");if(!location)throw new HTTPError(502,"Storage did not create an upload session","storage_error");const absolute=new URL(location,upstream).toString();const {error:updateError}=await client.from("upload_intents").update({resumable_url:absolute}).eq("photo_id",photoID).eq("guest_id",guestID);if(updateError)throw updateError;}
  const outHeaders=new Headers(cors);for(const name of ["Tus-Resumable","Upload-Offset","Upload-Length","Upload-Expires"]){const value=response.headers.get(name);if(value)outHeaders.set(name,value);}if(creating&&response.ok)outHeaders.set("Location",new URL(req.url).toString());
  return new Response(response.body,{status:response.status,headers:outHeaders});
}

function storageBaseURL(){const url=new URL(Deno.env.get("SUPABASE_URL")!);if(url.hostname.endsWith(".supabase.co"))url.hostname=url.hostname.replace(/\.supabase\.co$/,".storage.supabase.co");return url.origin;}
function tusMetadata(values:Record<string,string>){return Object.entries(values).map(([key,value])=>`${key} ${btoa(value)}`).join(",");}

async function galleryRoute(req: Request, slug: string, client: SupabaseClient) {
  const token = bearer(req);
  const event = await validEvent(client, slug, token);
  const url = new URL(req.url);
  const limit = Math.min(Math.max(positiveInt(url.searchParams.get("limit")) || 24, 1), 60);
  const before = validDateCursor(url.searchParams.get("before"));
  const photoQuery = client.from("photos").select(photoColumns()).eq("event_id", event.id).eq("status", "approved").order("created_at", { ascending: false }).limit(limit + 1);
  const mediaQuery = client.from("event_media").select(mediaColumns()).eq("event_id", event.id).eq("upload_status", "uploaded").eq("approval_status", "approved").order("created_at", { ascending: false }).limit(limit + 1);
  if (before) {
    photoQuery.lt("created_at", before);
    mediaQuery.lt("created_at", before);
  }
  const [{ data: photos, error }, { data: media, error: mediaError }] = await Promise.all([
    photoQuery,
    mediaQuery
  ]);
  if (error || mediaError) throw error || mediaError;
  const galleryPhotos: any[] = [...((photos || []) as any[]), ...mapEventMedia((media || []) as any[])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const pagePhotos = galleryPhotos.slice(0, limit);
  const lastPhoto = pagePhotos.at(-1);
  return json({ event, photos: await signedPhotos(client, await withGuestNames(client, pagePhotos)), next_cursor: galleryPhotos.length > limit && lastPhoto ? lastPhoto.created_at : null });
}

async function validEvent(client: SupabaseClient, slug: string, token: string) { const {data,error}=await client.from("events").select(`${eventColumns},access_token_hash`).eq("slug",slug).neq("status","deleted").single(); if(error||!data)throw new HTTPError(404,"Event not found","not_found"); const cfg=await config(client); if(!token||!safeEqual(data.access_token_hash,await tokenHash(token,cfg.token_pepper)))throw new HTTPError(401,"Unauthorized","unauthorized"); delete data.access_token_hash; return data; }
async function findOrCreateGuest(client: SupabaseClient,event:any,req:Request,name:string,create:boolean){const raw=req.headers.get("x-guest-token")||bearer(req);if(!raw)throw new HTTPError(401,"Guest token required","unauthorized");const cfg=await config(client),hash=await tokenHash(raw,cfg.token_pepper);let {data}=await client.from("guests").select("*").eq("event_id",event.id).eq("device_token_hash",hash).maybeSingle();if(data){if(name&&name!==data.display_name){const out=await client.from("guests").update({display_name:name.slice(0,100),last_seen_at:new Date().toISOString()}).eq("id",data.id).select("*").single();data=out.data;}return data;}if(!create)return null;if(!name)throw new HTTPError(400,"Guest name is required","guest_name_required");if(await count(client,"guests",q=>q.eq("event_id",event.id))>=event.max_guests)throw new HTTPError(409,"Guest limit reached","guest_limit");const now=new Date().toISOString(),row={id:id26(),event_id:event.id,device_token_hash:hash,display_name:name.slice(0,100),upload_count:0,message_count:0,created_at:now,last_seen_at:now,status:"active"};const out=await client.from("guests").insert(row).select("*").single();if(out.error)throw out.error;return out.data;}
function photoColumns(){return "id,event_id,guest_id,object_key,content_type,size_bytes,message,status,is_developed,width_px,height_px,created_at,updated_at";}
function mediaColumns(){return "id,event_id,guest_upload_session_id,guest_name,file_name,file_type,file_size,storage_path,media_type,upload_status,approval_status,created_at";}
function mapEventMedia(media:any[]){return media.map((m)=>({id:m.id,event_id:m.event_id,guest_id:m.guest_upload_session_id,guest_name:m.guest_name,object_key:m.storage_path,content_type:m.file_type,size_bytes:m.file_size,message:`Uploaded by ${m.guest_name}`,status:m.approval_status === "approved" ? "approved" : m.approval_status === "pending" ? "pending" : "hidden",is_developed:true,created_at:m.created_at,updated_at:m.created_at,media_type:m.media_type,file_name:m.file_name}));}
async function withGuestNames(client:SupabaseClient,photos:any[]){const ids=[...new Set(photos.filter(p=>!p.guest_name&&p.guest_id).map(p=>p.guest_id))];if(!ids.length)return photos;const {data,error}=await client.from("guests").select("id,display_name").in("id",ids);if(error)throw error;const names=new Map((data||[]).map(g=>[g.id,g.display_name]));return photos.map(p=>p.guest_name? p : {...p,guest_name:names.get(p.guest_id)||""});}
async function signedPhotos(client:SupabaseClient,photos:any[]){return Promise.all(photos.map(async p=>{const original=await client.storage.from(bucket).createSignedUrl(p.object_key,3600);if(original.error)throw original.error;let thumbnail=original,preview=original;if(canTransformImage(p.content_type)){const [thumb,large]=await Promise.all([client.storage.from(bucket).createSignedUrl(p.object_key,2592000,{transform:{width:320,quality:45,resize:"contain"}}),client.storage.from(bucket).createSignedUrl(p.object_key,3600,{transform:{width:1600,quality:82,resize:"contain"}})]);if(!thumb.error)thumbnail=thumb;if(!large.error)preview=large;}return{...p,public_url:original.data?.signedUrl,thumbnail_url:thumbnail.data?.signedUrl,preview_url:preview.data?.signedUrl};}));}
function canTransformImage(type:string){return ["image/jpeg","image/png","image/webp"].includes(type);}
async function photoArchive(client:SupabaseClient,eventID:string){const {data}=await client.from("photos").select("id,object_key,content_type").eq("event_id",eventID).neq("status","deleted").limit(1000);const zip=new JSZip();for(const p of data||[]){const file=await client.storage.from(bucket).download(p.object_key);if(file.data)zip.file(`${p.id}.${extension(p.content_type)}`,await file.data.arrayBuffer());}const bytes=await zip.generateAsync({type:"uint8array"});return new Response(bytes.buffer as ArrayBuffer,{headers:{...cors,"Content-Type":"application/zip","Content-Disposition":'attachment; filename="event-photos.zip"'}});}

function galleryAvailable(e:any){return e.allow_immediate_gallery||e.mode==="live_gallery"||Date.now()>=new Date(e.reveal_at).getTime();}
async function ensureEventToken(client:SupabaseClient,event:any){const cfg=await config(client);let version=String(event.access_token_version||"");if(!version.startsWith("v2:")){version=`v2:${randomToken()}`;const token=await deriveAccessToken(event.id,version,cfg.token_pepper);const hash=await tokenHash(token,cfg.token_pepper);const {error}=await client.from("events").update({access_token_version:version,access_token_hash:hash,guest_upload_token_hash:hash,updated_at:new Date().toISOString()}).eq("id",event.id);if(error)throw error;event.access_token_version=version;return token;}return deriveAccessToken(event.id,version,cfg.token_pepper);}
async function deriveAccessToken(eventID:string,version:string,pepper:string){return sha256(`event:${pepper}:${eventID}:${version}`);}
function guestURL(slug:string,token:string){const base=Deno.env.get("PUBLIC_WEB_URL")||"https://one-shot-one-night.vercel.app";return `${base}/guest-upload/${slug}${token?`?token=${encodeURIComponent(token)}`:""}`;}
function extension(type:string){return type==="image/png"?"png":type==="image/webp"?"webp":type==="image/heic"?"heic":type==="image/heif"?"heif":type==="video/mp4"?"mp4":type==="video/quicktime"?"mov":type==="video/webm"?"webm":"jpg";}
function positiveInt(value:unknown){const n=Number(value);return Number.isInteger(n)&&n>0?n:null;}
function validDateCursor(value:string|null){if(!value)return "";const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toISOString();}
function slugify(v:string){return v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"event";}
function id26(){return crypto.randomUUID().replaceAll("-","").slice(0,26).toUpperCase();}
function randomToken(){const b=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...b)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");}
function bearer(req:Request){const v=req.headers.get("authorization")||"";return v.toLowerCase().startsWith("bearer ")?v.slice(7):"";}
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function tokenHash(token:string,pepper:string){return sha256(`${pepper}:${token}`);}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0;}
async function bodyJSON(req:Request){if(req.method==="GET"||req.method==="HEAD")return{};try{return await req.json();}catch{return{};}}
function adminDatabaseError(error: any) {
  return new HTTPError(500, String(error?.message || "Database request failed"), String(error?.code || "database_error"));
}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});}
