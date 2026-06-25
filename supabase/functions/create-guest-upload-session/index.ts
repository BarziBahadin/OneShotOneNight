import {
  adminClient,
  allowedTypes,
  bodyJSON,
  bucket,
  cleanFileName,
  cleanMessage,
  cleanName,
  cors,
  errorResponse,
  extension,
  HTTPError,
  id26,
  json,
  mediaType,
  positiveSize,
  validGuestUploadEvent
} from "../_shared/guest_upload.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ message: "Method not allowed", error: "method_not_allowed" }, 405);

  try {
    const client = adminClient();
    const body = await bodyJSON(req);
    const eventSlug = String(body.event_slug || body.eventSlug || "").trim();
    const uploadToken = String(body.token || body.upload_token || body.access_token || "").trim();
    const event = await validGuestUploadEvent(client, eventSlug, uploadToken);
    const guestName = cleanName(body.guest_name ?? body.guestName);
    const guestMessage = cleanMessage(body.guest_message ?? body.guestMessage);
    const files = Array.isArray(body.files) ? body.files.slice(0, event.max_photos_per_guest) : [];

    if (!files.length) throw new HTTPError(400, "At least one file is required", "validation_error");

    const sessionID = id26();
    const { error: sessionError } = await client.from("guest_upload_sessions").insert({
      id: sessionID,
      event_id: event.id,
      guest_name: guestName,
      guest_message: guestMessage,
      status: "uploading"
    });
    if (sessionError) throw sessionError;

    const uploadUrls = [];
    for (const file of files) {
      const contentType = String(file.content_type || file.file_type || "").toLowerCase();
      if (!allowedTypes.has(contentType)) throw new HTTPError(400, "Unsupported file type", "validation_error");

      const mediaID = id26();
      const type = mediaType(contentType);
      const fileName = cleanFileName(file.file_name || file.name, `${mediaID}.${extension(contentType)}`);
      const fileSize = positiveSize(file.file_size ?? file.size_bytes);
      const storagePath = `events/${event.id}/guest-upload-sessions/${sessionID}/${mediaID}.${extension(contentType)}`;
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(storagePath);
      if (error) throw error;

      uploadUrls.push({
        media_id: mediaID,
        file_name: fileName,
        file_type: contentType,
        file_size: fileSize,
        media_type: type,
        storage_path: storagePath,
        upload_url: data.signedUrl,
        upload_headers: { "Content-Type": contentType }
      });
    }

    return json({
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title || event.name,
        host_message: event.host_message || event.description
      },
      upload_session: {
        id: sessionID,
        status: "uploading",
        guest_name: guestName,
        guest_message: guestMessage
      },
      remaining_shots: Math.max(0, event.max_photos_per_guest - uploadUrls.length),
      upload_urls: uploadUrls
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});
