"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Copy, ImagePlus, Pencil, Sparkles, Upload } from "lucide-react";
import { EventRecord, guestURL, joinGuest, uploadGuestPhoto } from "@/lib/api";

export function GuestCamera({ slug, accessToken }: { slug: string; accessToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [galleryAvailable, setGalleryAvailable] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("Opening invitation...");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [lastUpload, setLastUpload] = useState("");
  const autoJoinAttempted = useRef(false);
  const activeToken = useMemo(() => normalizeToken(accessToken), [accessToken]);
  const shareLink = useMemo(() => guestURL(slug, activeToken), [slug, activeToken]);

  useEffect(() => {
    if (autoJoinAttempted.current || !activeToken) return;
    autoJoinAttempted.current = true;
    join("");
  }, [activeToken]);

  async function join(name: string) {
    setBusy(true);
    setStatus("");
    try {
      const out = await joinGuest(slug, activeToken, name);
      setEvent(out.event);
      setRemaining(out.remaining_shots);
      setGalleryAvailable(out.gallery_available);
    } catch (err) {
      setStatus(err instanceof Error ? friendlyJoinError(err.message) : "Unable to open this invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function saveName(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    await join(displayName.trim());
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus("Could not copy the guest link.");
    }
  }

  async function uploadPhoto(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const form = new FormData(submitEvent.currentTarget);
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      setStatus("Choose a photo before uploading.");
      return;
    }
    setUploading(true);
    setStatus("");
    setLastUpload("");
    try {
      const out = await uploadGuestPhoto(slug, activeToken, file, message.trim());
      setRemaining(out.remaining_shots);
      setMessage("");
      setLastUpload("Photo uploaded.");
      submitEvent.currentTarget.reset();
    } catch (err) {
      setStatus(err instanceof Error ? friendlyJoinError(err.message) : "Unable to upload this photo.");
    } finally {
      setUploading(false);
    }
  }

  if (!event) {
    return (
      <main className="scene-page grid place-items-center px-6 text-center">
        <img src="/pics/golden-event.jpg" alt="" className="scene-bg opacity-40" />
        <div className="scene-vignette" />
        <div className="scene-glass relative grid max-w-sm justify-items-center gap-5 rounded-[2rem] p-7">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/10">
            <Sparkles className="h-7 w-7" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase text-white/45">Guest invitation</p>
            <h1 className="mt-3 text-3xl font-semibold">{busy ? "Opening..." : status ? "Link unavailable" : "One moment..."}</h1>
            <p className="mt-3 text-sm leading-6 text-white/58">{status || "Preparing the private guest upload page."}</p>
          </div>
          {!busy && status ? <button type="button" onClick={() => join("")} className="rounded-full bg-white px-6 py-3 text-sm font-bold text-black">Try again</button> : null}
        </div>
      </main>
    );
  }

  const shotCounter = remaining == null ? `${event.max_photos_per_guest}` : `${Math.max(event.max_photos_per_guest - remaining, 0)} / ${event.max_photos_per_guest}`;

  return (
    <main className="scene-page">
      <img src="/pics/golden-event.jpg" alt="" className="scene-bg" />
      <div className="scene-vignette" />

      <section className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-xl flex-col justify-between px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <a href="/" className="scene-icon-button" aria-label="Back home">
            <ArrowLeft className="h-5 w-5" />
          </a>
          <span className="scene-pill">Guest upload</span>
        </div>

        <div className="px-3 text-center">
          <p className="text-xs font-bold uppercase text-white/58">Private event camera</p>
          <h1 className="scene-title mx-auto mt-4 max-w-[11ch]">{event.name}</h1>
          <p className="mx-auto mt-5 max-w-xs text-sm font-semibold leading-6 text-white/68">{formatEventDate(event.starts_at)}</p>
        </div>

        <div className="scene-sheet">
          <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-white/22" />

          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-black">
              <Camera className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-white/42">Add a photo</p>
              <p className="text-sm leading-5 text-white/68">Use your camera or choose a photo from your device.</p>
            </div>
          </div>

          <form onSubmit={saveName} className="grid gap-3">
            <label className="relative block">
              <Pencil className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/42" />
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="scene-field w-full pl-11"
                placeholder="Enter your name"
                autoComplete="name"
                aria-label="Enter your name"
              />
            </label>
            <button type="submit" disabled={busy} className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-bold text-white disabled:opacity-45">
              {busy ? "Saving..." : "Save name"}
            </button>
          </form>

          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <Metric label="Shots" value={shotCounter} />
            <Metric label="Album" value={galleryAvailable ? "Open" : "Locked"} />
            <Metric label="Upload" value="Web" />
          </div>

          <form onSubmit={uploadPhoto} className="mt-6 grid gap-3">
            <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-base font-bold text-black">
              <ImagePlus className="h-5 w-5" />
              Choose photo
              <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" className="sr-only" />
            </label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="scene-field min-h-20 w-full"
              placeholder="Optional message"
              maxLength={500}
            />
            <button type="submit" disabled={uploading || remaining === 0} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 text-sm font-bold text-white disabled:opacity-45">
              <Upload className="h-4 w-4" /> {uploading ? "Uploading..." : "Upload photo"}
            </button>
          </form>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button type="button" onClick={copyLink} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 text-sm font-bold text-white">
              <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy link"}
            </button>
            <a href={`/gallery/${slug}?t=${encodeURIComponent(activeToken)}`} className="flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-4 text-sm font-bold text-white">
              View album
            </a>
          </div>

          {lastUpload ? <p className="mt-4 rounded-2xl bg-emerald-500/15 px-4 py-3 text-center text-sm text-emerald-100">{lastUpload}</p> : null}
          {status ? <p className="mt-4 rounded-2xl bg-red-500/15 px-4 py-3 text-center text-sm text-red-100">{status}</p> : null}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3">
      <p className="text-[0.62rem] font-bold uppercase text-white/36">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold capitalize text-white/82">{value}</p>
    </div>
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

function friendlyJoinError(message: string) {
  if (message.includes("event_not_started")) return "This event has not started yet. Come back when the celebration begins.";
  if (message.includes("event_ended")) return "Photo uploads have closed for this event.";
  if (message.includes("event_paused") || message.includes("event_locked")) return "The host has paused photo uploads for now.";
  if (message.includes("upload_limit_reached")) return "You've used all your shots for this event.";
  if (message.includes("unauthorized")) return "This guest link is invalid or incomplete. Scan the event QR code again.";
  return message;
}

function formatEventDate(value?: string) {
  if (!value) return "Tonight";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tonight";
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(date);
}
