"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Copy,
  Images,
  Info,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { EventRecord, guestURL, joinGuest, uploadGuestPhoto } from "@/lib/api";

export function GuestCamera({ slug, accessToken }: { slug: string; accessToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [galleryAvailable, setGalleryAvailable] = useState(false);
  const [status, setStatus] = useState("Opening invitation...");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastUpload, setLastUpload] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const autoJoinAttempted = useRef(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const activeToken = useMemo(() => normalizeToken(accessToken), [accessToken]);
  const shareLink = useMemo(() => guestURL(slug, activeToken), [slug, activeToken]);

  useEffect(() => {
    if (autoJoinAttempted.current || !activeToken) return;
    autoJoinAttempted.current = true;
    void join();
  }, [activeToken]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function join() {
    setBusy(true);
    setStatus("");
    try {
      const out = await joinGuest(slug, activeToken, "");
      setEvent(out.event);
      setRemaining(out.remaining_shots);
      setGalleryAvailable(out.gallery_available);
      setSessionReady(true);
      window.history.replaceState({}, "", `/guest/${slug}`);
    } catch (err) {
      setStatus(err instanceof Error ? friendlyJoinError(err.message) : "Unable to open this invitation.");
    } finally {
      setBusy(false);
    }
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

  async function uploadPhoto(file: File) {
    if (!file.size) return;
    setUploading(true);
    setStatus("");
    setLastUpload("");
    try {
      const out = await uploadGuestPhoto(slug, sessionReady ? "" : activeToken, file, "");
      setRemaining(out.remaining_shots);
      setLastUpload("Your photo is safely stored for the reveal.");
    } catch (err) {
      setStatus(err instanceof Error ? friendlyJoinError(err.message) : "Unable to upload this photo.");
    } finally {
      setUploading(false);
      if (cameraInput.current) cameraInput.current.value = "";
      if (libraryInput.current) libraryInput.current.value = "";
    }
  }

  function onPhotoSelected(inputEvent: ChangeEvent<HTMLInputElement>) {
    const file = inputEvent.target.files?.[0];
    if (file) void uploadPhoto(file);
  }

  if (!event) {
    return (
      <main className="reveal-page grid place-items-center px-6 text-center">
        <img src="/pics/golden-event.jpg" alt="" className="reveal-bg opacity-45" />
        <div className="reveal-vignette" />
        <div className="reveal-dialog relative grid max-w-sm justify-items-center gap-5 p-7">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/10">
            <Sparkles className="h-7 w-7" />
          </span>
          <div>
            <p className="reveal-kicker">Guest invitation</p>
            <h1 className="mt-3 font-serif text-3xl font-semibold">{busy ? "Opening…" : "Link unavailable"}</h1>
            <p className="mt-3 text-sm leading-6 text-white/60">{status || "Preparing your private event camera."}</p>
          </div>
          {!busy && status ? <button type="button" onClick={() => void join()} className="reveal-light-button">Try again</button> : null}
        </div>
      </main>
    );
  }

  const maxShots = event.max_photos_per_guest;
  const shotsRemaining = remaining ?? maxShots;
  const shotsUsed = Math.max(maxShots - shotsRemaining, 0);
  const usedPercent = maxShots > 0 ? Math.min((shotsUsed / maxShots) * 100, 100) : 0;
  const countdown = revealCountdown(event.reveal_at, now);

  return (
    <main className="reveal-page">
      <img src="/pics/golden-event.jpg" alt="A candlelit dinner table at sunset" className="reveal-bg" />
      <div className="reveal-vignette" />

      <section className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col px-5 pb-[17rem] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <a href="/" className="reveal-icon-button" aria-label="Close event"><X className="h-6 w-6" /></a>
          <button type="button" onClick={() => setShowInfo(true)} className="reveal-chip"><Info className="h-5 w-5" /> Event info</button>
        </header>

        <div className="mt-[11vh] sm:mt-[13vh]">
          <p className="reveal-kicker flex items-center gap-2">You’re joined <LockKeyhole className="h-4 w-4" /></p>
          <h1 className="mt-3 whitespace-nowrap font-serif text-[2.4rem] font-semibold leading-[0.95] tracking-[-0.045em] text-white min-[360px]:text-[2.85rem]">{event.name}</h1>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.08em] text-white/58">{formatEventDate(event.starts_at)}</p>
        </div>

        <div className="mt-auto pt-8">
          {!galleryAvailable ? (
            <section aria-label="Reveal countdown">
              <p className="reveal-kicker">Photos reveal in</p>
              <div className="mt-3 grid grid-cols-3 gap-4" aria-live="polite">
                <TimeUnit value={countdown.hours} label="Hrs" />
                <TimeUnit value={countdown.minutes} label="Min" />
                <TimeUnit value={countdown.seconds} label="Sec" />
              </div>
              <div className="mt-7 flex items-center gap-4">
                <span className="reveal-feature-icon"><LockKeyhole className="h-5 w-5 text-amber" /></span>
                <div>
                  <p className="font-semibold">Photos are locked.</p>
                  <p className="mt-1 text-sm leading-5 text-white/54">You’ll be able to view them after the reveal.</p>
                </div>
              </div>
            </section>
          ) : (
            <a href={`/gallery/${slug}`} className="reveal-open-gallery">The album is revealed — view photos</a>
          )}

          <section className="mt-8" aria-label="Photo allowance">
            <div className="flex items-center gap-4">
              <span className="reveal-feature-icon"><Camera className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{shotsUsed} of {maxShots} shots used</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/14">
                  <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${usedPercent}%` }} />
                </div>
                <p className="mt-2 text-sm text-white/48">Add up to {maxShots} photos to this event.</p>
              </div>
            </div>
          </section>

          <section className="reveal-actions mt-8">
            <button type="button" disabled={uploading || shotsRemaining === 0} onClick={() => cameraInput.current?.click()} className="reveal-primary-action">
              <Camera className="h-6 w-6" /> {uploading ? "Uploading…" : "Take a photo"}
            </button>
            <button type="button" disabled={uploading || shotsRemaining === 0} onClick={() => libraryInput.current?.click()} className="reveal-secondary-action">
              <Images className="h-6 w-6" /> Choose from library
            </button>
            <input ref={cameraInput} onChange={onPhotoSelected} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" className="sr-only" />
            <input ref={libraryInput} onChange={onPhotoSelected} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" />
            <p className="flex items-center justify-center gap-2 text-center text-xs text-white/46"><ShieldCheck className="h-4 w-4 text-amber" /> Private event. Only the host controls the reveal.</p>
          </section>

          {lastUpload ? <p className="reveal-notice mt-4 text-emerald-100"><Check className="h-4 w-4" /> {lastUpload}</p> : null}
          {status ? <p className="reveal-notice mt-4 text-red-100">{status}</p> : null}
        </div>
      </section>

      {showInfo ? (
        <div className="fixed inset-0 z-30 grid items-end bg-black/64 px-3" role="presentation" onClick={() => setShowInfo(false)}>
          <section className="reveal-info-sheet mx-auto w-full max-w-[430px]" role="dialog" aria-modal="true" aria-labelledby="event-info-title" onClick={(clickEvent) => clickEvent.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="reveal-kicker">Private event</p><h2 id="event-info-title" className="mt-2 font-serif text-3xl">{event.name}</h2></div>
              <button type="button" onClick={() => setShowInfo(false)} className="reveal-icon-button" aria-label="Close event information"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-5 text-sm leading-6 text-white/60">{event.description || "Share the night from your point of view. Every photo stays private until the reveal."}</p>
            <button type="button" onClick={() => void copyLink()} className="reveal-secondary-action mt-6 w-full"><Copy className="h-5 w-5" /> {copied ? "Link copied" : "Copy guest link"}</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function TimeUnit({ value, label }: { value: string; label: string }) {
  return <div><p className="font-serif text-[2.65rem] leading-none tracking-[-0.04em]">{value}</p><p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/46">{label}</p></div>;
}

function revealCountdown(value: string | undefined, now: number) {
  const revealAt = value ? new Date(value).getTime() : now;
  const difference = Math.max(revealAt - now, 0);
  const totalSeconds = Math.floor(difference / 1000);
  return {
    hours: String(Math.floor(totalSeconds / 3600)).padStart(2, "0"),
    minutes: String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0"),
    seconds: String(totalSeconds % 60).padStart(2, "0")
  };
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
  if (message.includes("upload_limit_reached")) return "You’ve used all your shots for this event.";
  if (message.includes("unauthorized")) return "This guest link is invalid or incomplete. Scan the event QR code again.";
  return message;
}

function formatEventDate(value?: string) {
  if (!value) return "Tonight";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tonight";
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(date);
}
