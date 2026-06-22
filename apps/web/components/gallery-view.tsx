"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Camera, Download, QrCode, Share2, X } from "lucide-react";
import { EventRecord, guestGallery, guestURL, joinGuest, PhotoRecord, rememberGuestAccessToken, storedGuestAccessToken } from "@/lib/api";

export function GalleryView({ slug, accessToken }: { slug: string; accessToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [showQR, setShowQR] = useState(false);
  const [qrDataURL, setQRDataURL] = useState("");
  const [toast, setToast] = useState("");

  const activeToken = useMemo(() => accessToken || storedGuestAccessToken(slug), [slug, accessToken]);
  const link = useMemo(() => guestURL(slug, activeToken), [slug, activeToken]);
  const visiblePhotos = photos.filter((photo) => photo.status === "approved" && photo.is_developed !== false);
  const locked = Boolean(status && /developing|unlock|reveal/i.test(status));

  useEffect(() => {
    async function load() {
      try {
        if (activeToken) {
          rememberGuestAccessToken(slug, activeToken);
          await joinGuest(slug, activeToken, "");
          window.history.replaceState({}, "", `/gallery/${slug}`);
        }
        const out = await guestGallery(slug, activeToken);
        setEvent(out.event);
        setPhotos(out.photos);
        setStatus(out.photos.length ? "" : "No approved photos yet.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load the album.";
        setStatus(message.includes("reveal_not_reached") ? "Photos are sealed until the reveal. Come back when the album unlocks." : message);
      }
    }
    load();
  }, [slug, activeToken]);

  useEffect(() => {
    if (!showQR) return;
    QRCode.toDataURL(link, { margin: 1, width: 760, color: { dark: "#030303", light: "#ffffff" } })
      .then(setQRDataURL)
      .catch(() => setToast("Could not create QR code."));
  }, [showQR, link]);

  useEffect(() => {
    if (!showQR) return;
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") setShowQR(false);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [showQR]);

  async function shareLink() {
    try {
      if (navigator.share) {
        await navigator.share({ title: event?.name ?? "OneShotOneNight album", url: link });
        setToast("Share sheet opened.");
      } else {
        await navigator.clipboard.writeText(link);
        setToast("Link copied.");
      }
    } catch {
      setToast("Could not share this link.");
    }
  }

  function saveQR() {
    if (!qrDataURL) return;
    const anchor = document.createElement("a");
    anchor.href = qrDataURL;
    anchor.download = `${event?.slug ?? slug}-qr.png`;
    anchor.click();
    setToast("QR image saved.");
  }

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#030303] text-white">
      <img src="/pics/golden-event.jpg" alt="" className="fixed inset-0 h-full w-full object-cover opacity-35 blur-sm scale-105" />
      <div className="fixed inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.72),rgba(0,0,0,0.25)_34%,rgba(0,0,0,0.98))]" />

      <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-5xl flex-col px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <a href={`/guest/${slug}`} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/45 backdrop-blur" aria-label="Back to camera">
            <ArrowLeft className="h-5 w-5" />
          </a>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowQR(true)} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/45 backdrop-blur" aria-label="Share QR code">
              <QrCode className="h-5 w-5" />
            </button>
            <a href={`/guest/${slug}`} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white text-black shadow-xl" aria-label="Open camera">
              <Camera className="h-5 w-5" />
            </a>
          </div>
        </div>

        <section className="mt-auto rounded-t-[3.5rem] border border-white/10 bg-black/[0.9] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_-28px_90px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:px-8">
          <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-white/20" />
          <header className="text-center">
            <p className="text-xs font-bold uppercase text-white/45">The photographs</p>
            <h1 className="mx-auto mt-3 max-w-2xl text-5xl font-semibold leading-[0.9] sm:text-7xl">{event?.name ?? "Gallery"}</h1>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-white/55">{event ? revealCopy(event, locked) : "Loading the album..."}</p>
          </header>

          <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-3 text-center text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
              <strong className="block text-2xl text-white">{visiblePhotos.length}</strong>
              <span className="text-white/48">photos</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
              <strong className="block text-2xl text-white">{locked ? "Locked" : "Open"}</strong>
              <span className="text-white/48">reveal</span>
            </div>
          </div>

          {locked || !event?.allow_immediate_gallery ? (
            <div className="mx-auto mt-5 w-fit rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold text-white/70">
              Only the host can see everyone's photos
            </div>
          ) : null}

          {status ? (
            <LockedOrEmptyState locked={locked} message={status} cameraHref={`/guest/${slug}`} />
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visiblePhotos.map((photo) => (
                <figure key={photo.id} className="group relative aspect-[3/4] overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.04]">
                  <img src={photo.public_url} alt={photo.message || "Event photo"} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <figcaption className="line-clamp-2 text-xs leading-5 text-white/78">{photo.message || formatPhotoDate(photo.created_at)}</figcaption>
                  </div>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>

      {showQR ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="qr-title">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close QR share sheet" onClick={() => setShowQR(false)} />
          <section className="relative w-full max-w-md rounded-t-[3rem] border border-white/10 bg-black/[0.94] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-white shadow-[0_-28px_90px_rgba(0,0,0,0.75)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 id="qr-title" className="text-3xl font-semibold">Share QR code</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">Anyone can join the album by scanning the QR code. No app download is required.</p>
              </div>
              <button type="button" onClick={() => setShowQR(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]" aria-label="Close QR share sheet">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="rounded-[2rem] bg-white p-5">
              {qrDataURL ? <img src={qrDataURL} alt={`QR code for ${event?.name ?? "event"}`} className="aspect-square w-full" /> : <div className="grid aspect-square place-items-center text-sm font-bold text-black/50">Creating QR...</div>}
            </div>
            <p className="mt-4 text-center text-sm font-bold text-white">{event?.name ?? "OneShotOneNight"}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={shareLink} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-black">
                <Share2 className="h-4 w-4" /> Share link
              </button>
              <button type="button" onClick={saveQR} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.08] text-sm font-bold text-white">
                <Download className="h-4 w-4" /> Save QR
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toast ? <button type="button" onClick={() => setToast("")} className="fixed inset-x-4 bottom-5 z-[60] rounded-2xl border border-white/10 bg-black/85 px-4 py-3 text-center text-sm text-white backdrop-blur">{toast}</button> : null}
    </main>
  );
}

function LockedOrEmptyState({ locked, message, cameraHref }: { locked: boolean; message: string; cameraHref: string }) {
  return (
    <div className="mx-auto mt-8 grid max-w-md justify-items-center rounded-[2rem] border border-white/10 bg-white/[0.05] px-5 py-8 text-center">
      <QrCode className="h-8 w-8 text-white/45" />
      <h2 className="mt-4 text-3xl font-semibold">{locked ? "Film is developing" : "Be the first to capture a moment."}</h2>
      <p className="mt-3 text-sm leading-6 text-white/55">{locked ? "Photos are sealed until the reveal. Come back when the album unlocks." : message || "Grab your camera and start shooting!"}</p>
      <a href={cameraHref} className="mt-5 rounded-full bg-white px-6 py-3 text-sm font-bold text-black">Open Camera</a>
    </div>
  );
}

function revealCopy(event: EventRecord, locked: boolean) {
  if (locked) return "Photos are sealed until the reveal. Come back when the album unlocks.";
  if (event.allow_immediate_gallery) return "Approved moments appear here as the host lets them through.";
  const reveal = new Date(event.reveal_at);
  if (Number.isNaN(reveal.getTime())) return "The host controls when this album opens.";
  if (Date.now() >= reveal.getTime()) return "The album is unlocked. Approved photos are ready.";
  return `The album unlocks ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(reveal)}.`;
}

function formatPhotoDate(value?: string) {
  if (!value) return "Captured moment";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Captured moment";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
