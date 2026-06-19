"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Images, Send, WifiOff, X } from "lucide-react";
import { EventRecord, joinGuest, presignUpload, registerPhoto } from "@/lib/api";
import { countQueuedPhotos, flushQueuedPhotos, installOfflineUploadSync, queueOfflinePhotos } from "@/lib/offline-uploads";

type QueuedPhoto = {
  id: string;
  file: File;
  preview: string;
};

export function GuestCamera({ slug, accessToken }: { slug: string; accessToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [token, setToken] = useState(accessToken);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [galleryAvailable, setGalleryAvailable] = useState(false);
  const [queuedOffline, setQueuedOffline] = useState(0);
  const [queue, setQueue] = useState<QueuedPhoto[]>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [invitationOpened, setInvitationOpened] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const autoJoinAttempted = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputAccept = "image/*";

  useEffect(() => {
    countQueuedPhotos().then(setQueuedOffline).catch(() => undefined);
    return installOfflineUploadSync((nextStatus) => {
      setStatus(nextStatus);
      countQueuedPhotos().then(setQueuedOffline).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    if (event || busy || autoJoinAttempted.current) return;
    const activeToken = normalizeToken(token);
    if (!activeToken) return;
    autoJoinAttempted.current = true;
    joinInstantGuest(activeToken);
  }, [token, event, busy]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function joinInstantGuest(activeToken = normalizeToken(token)) {
    autoJoinAttempted.current = true;
    setBusy(true);
    setStatus("");
    try {
      const out = await joinGuest(slug, activeToken, "");
      setEvent(out.event);
      setRemaining(out.remaining_shots);
      setGalleryAvailable(out.gallery_available);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to join";
      setStatus(friendlyJoinError(message));
    } finally {
      setBusy(false);
    }
  }

  function selectPhoto(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    addFiles(selected);
    e.target.value = "";
  }

  function addFiles(files: File[]) {
    if (!files.length) return;
    const remainingSlots = Math.max((remaining ?? files.length) - queue.length, 0);
    const accepted = files.slice(0, remainingSlots).map((next) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: next,
      preview: URL.createObjectURL(next)
    }));
    if (accepted.length) {
      setQueue((current) => [...current, ...accepted]);
    }
    if (files.length > accepted.length) {
      setStatus(`Only ${accepted.length} photo${accepted.length === 1 ? "" : "s"} added because of the remaining shot limit.`);
    }
  }

  function clearQueue() {
    queue.forEach((item) => URL.revokeObjectURL(item.preview));
    setQueue([]);
  }

  function removeQueuedPhoto(id: string) {
    setQueue((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  async function openCamera() {
    setStatus("");
    if (!canUseLiveCamera()) {
      setStatus("Live camera needs HTTPS on phones. Use the phone camera picker below while testing over Wi-Fi.");
      nativeCameraInputRef.current?.click();
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      setStream(nextStream);
      setCameraOpen(true);
      window.setTimeout(() => videoRef.current?.play().catch(() => undefined), 0);
    } catch (err) {
      setStatus(err instanceof Error ? `Camera blocked: ${err.message}` : "Camera blocked by the browser.");
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setCameraOpen(false);
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setStatus("Camera is not ready yet. Wait a second and press capture again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setStatus("Could not capture this camera frame.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setStatus("Could not create a photo from the camera.");
      return;
    }
    const photo = new File([blob], `event-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    addFiles([photo]);
    stopCamera();
  }

  async function upload() {
    if (!queue.length) return;
    if (!navigator.onLine) {
      await queueCurrentPhotos();
      setStatus("No network. Photos saved locally and will auto-upload when reception returns.");
      return;
    }
    setBusy(true);
    setStatus(`Preparing ${queue.length} upload${queue.length === 1 ? "" : "s"}...`);
    let failedAt = 0;
    try {
      const activeToken = normalizeToken(token);
      let lastRemaining = remaining ?? 0;
      for (let index = 0; index < queue.length; index++) {
        failedAt = index;
        const item = queue[index];
        setStatus(`Uploading ${index + 1} of ${queue.length}...`);
        const presigned = await presignUpload(slug, activeToken, item.file);
        const uploadResponse = await fetch(presigned.upload_url, { method: "PUT", headers: { "Content-Type": item.file.type }, body: item.file });
        if (!uploadResponse.ok) {
          throw new Error(`Object storage rejected ${item.file.name} (${uploadResponse.status})`);
        }
        const registered = await registerPhoto(slug, activeToken, {
          photo_id: presigned.photo_id,
          object_key: presigned.object_key,
          content_type: item.file.type,
          size_bytes: item.file.size,
          upload_token: presigned.upload_token,
          message
        });
        lastRemaining = registered.remaining_shots;
        failedAt = index + 1;
      }
      setRemaining(lastRemaining);
      clearQueue();
      setMessage("");
      setStatus("");
      setUploaded(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "";
      if (isGuestFlowError(errorMessage)) {
        setStatus(friendlyJoinError(errorMessage));
      } else {
        await queueCurrentPhotos(failedAt);
        setStatus("Connection lost. Your photos are saved here and will upload automatically when you’re back online.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function queueCurrentPhotos(startIndex = 0) {
    const activeToken = normalizeToken(token);
    const items = queue.slice(startIndex).map((item) => ({
      slug,
      accessToken: activeToken,
      file: item.file,
      fileName: item.file.name || `event-photo-${Date.now()}.jpg`,
      contentType: item.file.type || "image/jpeg",
      sizeBytes: item.file.size,
      message
    }));
    if (items.length) await queueOfflinePhotos(items);
    setQueuedOffline(await countQueuedPhotos());
    clearQueue();
    setMessage("");
  }

  async function flushOfflineNow() {
    setBusy(true);
    const result = await flushQueuedPhotos(setStatus);
    setQueuedOffline(result.remaining);
    setStatus(result.remaining ? `${result.remaining} photo${result.remaining === 1 ? "" : "s"} still waiting for network.` : "Saved photos uploaded.");
    setBusy(false);
  }

  function openInvitation() {
    setInvitationOpened(true);
    if (event?.prefer_camera_capture) {
      window.setTimeout(openCamera, 50);
    }
  }

  if (!event) {
    return (
      <main className="grid min-h-[100svh] place-items-center bg-black px-6 text-center text-white">
        <div className="grid justify-items-center gap-5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/10">
            <Camera className="h-7 w-7" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber">Guest camera</p>
            <h1 className="mt-3 text-3xl font-semibold">{busy ? "Opening camera..." : status ? "Camera unavailable" : "One moment..."}</h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/55">{status || "No account or sign-in needed."}</p>
          </div>
          {!busy && status ? <button type="button" onClick={() => joinInstantGuest()} className="rounded-full bg-white px-6 py-3 text-sm font-bold text-black">Try again</button> : null}
        </div>
      </main>
    );
  }

  if (!invitationOpened) {
    return (
      <main className="min-h-[100svh] bg-black p-2 text-[#111] sm:grid sm:place-items-center sm:p-6">
        <section className="mx-auto flex min-h-[calc(100svh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-[2.75rem] bg-[#f2f1eb] shadow-[0_30px_100px_rgba(0,0,0,0.55)] sm:min-h-0">
          <div className="relative min-h-[58svh] flex-1 overflow-hidden bg-[#c9b89d]">
            <img src="/pics/golden-event.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/10" />
            <button type="button" onClick={() => { window.location.href = "/"; }} className="absolute right-6 top-[max(1.5rem,env(safe-area-inset-top))] z-20 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-white/85 text-black shadow-lg backdrop-blur-md" aria-label="Close invitation">
              <X className="h-8 w-8 stroke-[1.7]" />
            </button>
            <div className="absolute left-1/2 top-[48%] w-[76%] -translate-x-1/2 -translate-y-1/2 rotate-[-7deg] bg-[#f5f1e8] px-6 py-8 text-center shadow-[0_20px_45px_rgba(0,0,0,0.32)]">
              <p className="font-['Playfair_Display'] text-4xl font-semibold leading-[0.9] sm:text-5xl">You’re<br />invited!</p>
              <div className="mx-auto my-5 h-px w-12 bg-black/20" />
              <p className="text-sm leading-5 text-black/65">Welcome to the private album.<br />Capture the best moments today.</p>
            </div>
          </div>

          <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-8">
            <div className="flex items-center justify-between gap-5">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{event.name}</h1>
                <p className="mt-2 text-base text-black/65">Capture memories to make them last forever.</p>
              </div>
              <button type="button" onClick={openInvitation} disabled={remaining === 0} className="shrink-0 rounded-full bg-[#0a84ff] px-8 py-4 text-xl font-bold text-white shadow-[0_10px_24px_rgba(10,132,255,0.3)] disabled:bg-black/20">
                Open
              </button>
            </div>

            <div className="my-7 h-px bg-black/15" />

            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.9rem] bg-black text-white shadow-sm">
                <Camera className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-black/45">Powered by</p>
                <p className="truncate text-base font-bold">OneShotOneNight Camera</p>
              </div>
              <span className="ml-auto rounded-md border border-black/20 px-1.5 py-0.5 text-xs font-semibold text-black/45">WEB</span>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-[100svh] w-full max-w-xl flex-col overflow-hidden bg-black text-white">
      <input ref={nativeCameraInputRef} className="hidden" type="file" accept={inputAccept} capture="environment" onChange={selectPhoto} aria-label="Take photo" />

      <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between bg-gradient-to-b from-black/80 to-transparent px-5 pb-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{event.name}</p>
          <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.22em] text-white/55">OneShotOneNight</p>
        </div>
        <div className="rounded-full bg-black/35 px-3 py-1.5 text-xs font-bold backdrop-blur-md">
          {remaining} shot{remaining === 1 ? "" : "s"}
        </div>
      </header>

      {uploaded ? (
        <section className="grid min-h-[100svh] flex-1 place-items-center px-6 text-center">
          <div className="grid justify-items-center gap-6">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-amber text-black">
              <CheckCircle2 className="h-10 w-10" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber">Photo sent</p>
              <h2 className="mt-3 text-4xl font-semibold">That one’s in.</h2>
              <p className="mt-3 text-white/55">{remaining} shot{remaining === 1 ? "" : "s"} remaining</p>
            </div>
            {remaining ? (
              <button type="button" onClick={() => { setUploaded(false); openCamera(); }} className="flex min-h-14 items-center gap-2 rounded-full bg-white px-7 py-4 font-bold text-black">
                <Camera className="h-5 w-5" /> Take another
              </button>
            ) : <p className="font-semibold text-white/75">You’ve used all your shots.</p>}
          </div>
        </section>
      ) : queue.length ? (
        <section className="relative flex min-h-[100svh] flex-1 flex-col bg-black">
          <div className="relative flex-1 overflow-hidden">
            <img src={queue[0].preview} alt="Photo review" className="absolute inset-0 h-full w-full object-contain" />
            <button type="button" onClick={clearQueue} className="absolute left-5 top-[max(5.5rem,calc(env(safe-area-inset-top)+4.5rem))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 backdrop-blur" aria-label="Retake">
              <X className="h-5 w-5" />
            </button>
            {queue.length > 1 ? (
              <div className="absolute inset-x-4 bottom-4 flex gap-2 overflow-x-auto">
                {queue.map((item) => (
                  <button key={item.id} type="button" onClick={() => removeQueuedPhoto(item.id)} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/30">
                    <img src={item.preview} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 border-t border-white/10 bg-black px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a message (optional)" className="h-11 rounded-full border border-white/15 bg-white/10 px-4 text-sm text-white placeholder:text-white/40" />
            <button type="button" onClick={upload} disabled={busy || remaining === 0} className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-white px-6 font-bold text-black disabled:opacity-50">
              <Send className="h-5 w-5" /> {busy ? "Sending..." : `Use photo${queue.length > 1 ? `s (${queue.length})` : ""}`}
            </button>
          </div>
        </section>
      ) : (
        <section className="relative min-h-[100svh] flex-1 overflow-hidden">
          {cameraOpen ? (
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#262626_0%,#111_48%,#000_100%)]">
              <div className="absolute inset-5 top-24 bottom-36 rounded-[2rem] border border-white/10">
                <span className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
                <span className="absolute left-1/2 top-1/2 h-px w-20 -translate-x-1/2 bg-white/15" />
                <span className="absolute left-1/2 top-1/2 h-20 w-px -translate-y-1/2 bg-white/15" />
              </div>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/85 to-transparent px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-24">
            <div className="grid grid-cols-3 items-center">
              {event.allow_gallery_uploads ? (
                <label className="relative flex h-12 w-12 cursor-pointer items-center justify-center justify-self-start rounded-xl border border-white/15 bg-white/10">
                  <Images className="h-5 w-5" />
                  <input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept={inputAccept} multiple onChange={selectPhoto} aria-label="Choose from gallery" />
                </label>
              ) : <span />}
              <button type="button" onClick={cameraOpen ? captureFrame : openCamera} disabled={remaining === 0} className="flex h-[5.25rem] w-[5.25rem] items-center justify-center justify-self-center rounded-full border-[5px] border-white bg-white/20 disabled:opacity-40" aria-label="Take photo">
                <span className="h-16 w-16 rounded-full bg-white" />
              </button>
              <a href={`/gallery/${slug}?t=${encodeURIComponent(normalizeToken(token))}`} className="justify-self-end text-center text-[0.62rem] font-bold uppercase tracking-[0.16em] text-white/65">
                Gallery<br />{galleryAvailable ? "Open" : "Locked"}
              </a>
            </div>
            <p className="mt-4 text-center text-xs text-white/45">{remaining === 0 ? "No shots remaining" : cameraOpen ? "Tap the shutter" : "Tap the shutter to open camera"}</p>
          </div>
        </section>
      )}

      {queuedOffline ? (
        <button type="button" onClick={flushOfflineNow} className="absolute inset-x-4 top-24 z-40 flex items-center justify-center gap-2 rounded-full bg-amber px-4 py-3 text-xs font-bold text-black shadow-xl">
          <WifiOff className="h-4 w-4" /> {queuedOffline} saved offline. Tap to retry.
        </button>
      ) : null}
      {status ? <p className="absolute inset-x-4 bottom-36 z-40 rounded-2xl bg-black/75 px-4 py-3 text-center text-xs leading-5 text-white backdrop-blur">{status}</p> : null}
    </main>
  );
}

function normalizeToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("t") ?? trimmed;
  } catch {
    return trimmed;
  }
}

function canUseLiveCamera() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
}

function friendlyJoinError(message: string) {
  if (message.includes("event_not_started")) return "This event has not started yet. Come back when the celebration begins.";
  if (message.includes("event_ended")) return "Photo uploads have closed for this event.";
  if (message.includes("event_paused") || message.includes("event_locked")) return "The host has paused photo uploads for now.";
  if (message.includes("upload_limit_reached")) return "You’ve used all your shots for this event.";
  if (message.includes("unauthorized")) return "This guest link is invalid or incomplete. Scan the event QR code again.";
  return message;
}

function isGuestFlowError(message: string) {
  return ["event_not_started", "event_ended", "event_paused", "event_locked", "upload_limit_reached", "unauthorized", "forbidden"].some((code) => message.includes(code));
}
