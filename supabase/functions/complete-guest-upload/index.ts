import {
  adminClient,
  bodyJSON,
  cors,
  errorResponse,
  HTTPError,
  json,
  mediaType,
  validGuestUploadEvent,
  verifyStoredObject
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

    const uploadedFiles = Array.isArray(body.uploaded_files)
      ? body.uploaded_files.slice(0, event.max_photos_per_guest)
      : [];
    if (!uploadedFiles.length) throw new HTTPError(400, "No uploaded files were provided", "validation_error");

    const { data: expectedMedia, error: expectedError } = await client
      .from("event_media")
      .select("id,storage_path,file_name,file_type,file_size,media_type")
      .eq("guest_upload_session_id", sessionID)
      .eq("event_id", event.id)
      .eq("upload_status", "pending");
    if (expectedError) throw expectedError;
    const expectedByPath = new Map((expectedMedia || []).map((item) => [item.storage_path, item]));

    const rows = [];
    for (const file of uploadedFiles) {
      const storagePath = String(file.storage_path || "").trim();
      const expectedPrefix = `events/${event.id}/guest-upload-sessions/${sessionID}/`;
      if (!storagePath.startsWith(expectedPrefix)) throw new HTTPError(400, "Invalid storage path", "validation_error");

      const expected = expectedByPath.get(storagePath);
      if (!expected || (file.media_id && String(file.media_id) !== expected.id)) {
        throw new HTTPError(400, "The file was not part of this upload session", "validation_error");
      }

      await verifyStoredObject(client, storagePath, Number(expected.file_size), expected.file_type);
      const fileType = expected.file_type;
      const type = mediaType(fileType);
      const size = Number(expected.file_size);

      rows.push({
        id: expected.id,
        event_id: event.id,
        guest_upload_session_id: sessionID,
        guest_name: session.guest_name,
        file_name: expected.file_name,
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
