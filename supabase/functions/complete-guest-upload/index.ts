import {
  adminClient,
  bodyJSON,
  bucket,
  cleanFileName,
  cors,
  errorResponse,
  extension,
  HTTPError,
  id26,
  json,
  mediaType,
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
    const sessionID = String(body.upload_session_id || body.session_id || "").trim();

    const { data: session, error: sessionError } = await client
      .from("guest_upload_sessions")
      .select("id,event_id,guest_name,guest_message,status")
      .eq("id", sessionID)
      .eq("event_id", event.id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new HTTPError(404, "Upload session not found", "not_found");
    if (session.status === "completed") throw new HTTPError(409, "Upload session is already completed", "already_completed");

    const uploadedFiles = Array.isArray(body.uploaded_files) ? body.uploaded_files : [];
    if (!uploadedFiles.length) throw new HTTPError(400, "No uploaded files were provided", "validation_error");

    const rows = [];
    for (const file of uploadedFiles) {
      const storagePath = String(file.storage_path || "").trim();
      const expectedPrefix = `events/${event.id}/guest-upload-sessions/${sessionID}/`;
      if (!storagePath.startsWith(expectedPrefix)) throw new HTTPError(400, "Invalid storage path", "validation_error");

      const object = await client.storage.from(bucket).download(storagePath);
      if (object.error || !object.data) throw new HTTPError(400, "Uploaded file was not found in storage", "upload_missing");

      const fileType = String(file.file_type || object.data.type || "").toLowerCase();
      const type = mediaType(fileType);
      const size = Number(file.file_size || object.data.size);
      if (!Number.isInteger(size) || size <= 0) throw new HTTPError(400, "Invalid uploaded file size", "validation_error");

      rows.push({
        id: String(file.media_id || "").trim() || id26(),
        event_id: event.id,
        guest_upload_session_id: sessionID,
        guest_name: session.guest_name,
        file_name: cleanFileName(file.file_name || file.name, `${id26()}.${extension(fileType)}`),
        file_type: fileType,
        file_size: size,
        storage_path: storagePath,
        media_type: type,
        upload_status: "uploaded",
        approval_status: event.auto_approve_photos ? "approved" : "pending"
      });
    }

    const { data: media, error: mediaError } = await client
      .from("event_media")
      .upsert(rows, { onConflict: "storage_path" })
      .select("*");
    if (mediaError) throw mediaError;

    const { error: completeError } = await client
      .from("guest_upload_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", sessionID)
      .eq("event_id", event.id);
    if (completeError) throw completeError;

    return json({
      upload_session: { id: sessionID, status: "completed" },
      media: media || []
    });
  } catch (error) {
    return errorResponse(error);
  }
});
