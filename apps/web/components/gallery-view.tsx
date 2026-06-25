"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, Camera, ChevronLeft, ChevronRight, Download, Grid3X3, Heart, Images, MapPin, QrCode, Share2, Users, X } from "lucide-react";
import { EventRecord, guestGallery, guestURL, PhotoRecord, rememberGuestAccessToken, storedGuestAccessToken } from "@/lib/api";

type GalleryMode = "classic" | "album";

export function GalleryView({ slug, accessToken }: { slug: string; accessToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [showQR, setShowQR] = useState(false);
  const [qrDataURL, setQRDataURL] = useState("");
  const [toast, setToast] = useState("");
  const [mode, setMode] = useState<GalleryMode>("classic");

  const activeToken = useMemo(() => accessToken || storedGuestAccessToken(slug), [slug, accessToken]);
  const link = useMemo(() => guestURL(slug, activeToken), [slug, activeToken]);
  const visiblePhotos = photos.filter((photo) => photo.status === "approved" && photo.is_developed !== false);
  const locked = Boolean(status && /developing|unlock|reveal/i.test(status));

  useEffect(() => {
    async function load() {
      try {
        if (activeToken) {
          rememberGuestAccessToken(slug, activeToken);
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
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(link, { margin: 1, width: 760, color: { dark: "#030303", light: "#ffffff" } }))
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
    <>
      {mode === "album" ? (
        <AlbumGalleryView event={event} photos={visiblePhotos} status={status} locked={locked} slug={slug} onClassicView={() => setMode("classic")} onShareQR={() => setShowQR(true)} />
      ) : (
        <ClassicGalleryView event={event} photos={visiblePhotos} status={status} locked={locked} slug={slug} onAlbumView={() => setMode("album")} onShareQR={() => setShowQR(true)} />
      )}

      {showQR ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="qr-title">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close QR share sheet" onClick={() => setShowQR(false)} />
          <section className="relative w-full max-w-md rounded-t-[3rem] border border-white/10 bg-black/[0.94] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-white shadow-[0_-28px_90px_rgba(0,0,0,0.75)]">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 id="qr-title" className="text-3xl font-semibold">Share QR code</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">Anyone can join the album by scanning the QR code. No app download is required.</p>
              </div>
              <button type="button" onClick={() => setShowQR(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]" aria-label="Close QR share sheet">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="rounded-[2rem] bg-white p-5">
              {qrDataURL ? <img src={qrDataURL} alt={`QR code for ${event?.name ?? "event"}`} width="760" height="760" decoding="async" className="aspect-square w-full" /> : <div className="grid aspect-square place-items-center text-sm font-bold text-black/50">Creating QR...</div>}
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
    </>
  );
}

function ClassicGalleryView({
  event,
  photos,
  status,
  locked,
  slug,
  onAlbumView,
  onShareQR
}: {
  event: EventRecord | null;
  photos: PhotoRecord[];
  status: string;
  locked: boolean;
  slug: string;
  onAlbumView: () => void;
  onShareQR: () => void;
}) {
  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#030303] text-white">
      <img src="/pics/golden-event-640.webp" alt="" width="640" height="960" decoding="async" className="fixed inset-0 h-full w-full scale-105 object-cover opacity-35 blur-sm" />
      <div className="fixed inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.72),rgba(0,0,0,0.25)_34%,rgba(0,0,0,0.98))]" />

      <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-5xl flex-col px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <a href={`/guest/${slug}`} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/45 backdrop-blur" aria-label="Back to camera">
            <ArrowLeft className="h-5 w-5" />
          </a>
          <div className="flex gap-2">
            <button type="button" onClick={onAlbumView} className="flex h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white px-4 text-sm font-bold text-black shadow-xl" aria-label="Open memory album view">
              <Images className="h-4 w-4" /> Album
            </button>
            <button type="button" onClick={onShareQR} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/45 backdrop-blur" aria-label="Share QR code">
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
              <strong className="block text-2xl text-white">{photos.length}</strong>
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
              {photos.map((photo, index) => (
                <figure key={photo.id} className="group relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.04]">
                  <img
                    src={photo.thumbnail_url || photo.public_url}
                    alt={photo.message || "Event photo"}
                    width={photo.width_px || 320}
                    height={photo.height_px || 427}
                    loading={index < 4 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "auto"}
                    decoding="async"
                    className="h-auto w-full transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <figcaption className="line-clamp-2 text-xs leading-5 text-white/78">{photo.message || formatPhotoDate(photo.created_at)}</figcaption>
                  </div>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function AlbumGalleryView({
  event,
  photos,
  status,
  locked,
  slug,
  onClassicView,
  onShareQR
}: {
  event: EventRecord | null;
  photos: PhotoRecord[];
  status: string;
  locked: boolean;
  slug: string;
  onClassicView: () => void;
  onShareQR: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const selectedPhoto = activeIndex === null ? null : photos[activeIndex];

  function showPrevious() {
    if (!photos.length) return;
    setActiveIndex((current) => (current === null ? 0 : (current - 1 + photos.length) % photos.length));
  }

  function showNext() {
    if (!photos.length) return;
    setActiveIndex((current) => (current === null ? 0 : (current + 1) % photos.length));
  }

  useEffect(() => {
    if (activeIndex === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, photos.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeIndex]);

  const dateLabel = formatEventDate(event?.starts_at);
  const location = event ? eventDetail(event, ["location", "venue", "city"]) || "A private celebration" : "Loading place";
  const hostName = event ? eventDetail(event, ["host_name", "hostName", "host"]) || "the Party Hosts" : "the Party Hosts";
  const attendeeCount = event?.max_guests ? `${event.max_guests}` : "Hosts";

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#f7efe1] text-[#2f2419]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(165,108,52,0.18),transparent_26rem),radial-gradient(circle_at_82%_4%,rgba(91,47,24,0.10),transparent_24rem),linear-gradient(180deg,#fff8ea_0%,#f7efe1_38%,#eadcc7_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.28] [background-image:radial-gradient(rgba(89,61,35,0.22)_0.7px,transparent_0.7px)] [background-size:4px_4px]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-48 bg-gradient-to-b from-white/55 to-transparent" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-14 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 lg:px-10">
        <nav className="flex items-center justify-between gap-3">
          <a href={`/guest/${slug}`} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#7b5731]/15 bg-white/65 text-[#3a2a1b] shadow-[0_14px_36px_rgba(95,61,26,0.13)] backdrop-blur" aria-label="Back to camera">
            <ArrowLeft className="h-5 w-5" />
          </a>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClassicView} className="inline-flex h-11 items-center gap-2 rounded-full border border-[#7b5731]/15 bg-white/75 px-4 text-sm font-bold text-[#3a2a1b] shadow-[0_14px_36px_rgba(95,61,26,0.13)] backdrop-blur" aria-label="Open classic gallery view">
              <Grid3X3 className="h-4 w-4" /> Classic
            </button>
            <button type="button" onClick={onShareQR} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#7b5731]/15 bg-white/75 text-[#3a2a1b] shadow-[0_14px_36px_rgba(95,61,26,0.13)] backdrop-blur" aria-label="Share QR code">
              <QrCode className="h-5 w-5" />
            </button>
          </div>
        </nav>

        <AlbumHero event={event} dateLabel={dateLabel} location={location} attendeeCount={attendeeCount} hostName={hostName} />
        <GalleryStats photos={photos} attendeeCount={attendeeCount} dateLabel={dateLabel} />
        <HostMessage />

        {status ? (
          status === "Loading..." ? <LoadingState /> : <AlbumEmptyState locked={locked} message={status} />
        ) : (
          <PhotoGalleryGrid photos={photos} onOpen={setActiveIndex} />
        )}
      </div>

      {selectedPhoto ? (
        <LightboxViewer
          photo={selectedPhoto}
          index={activeIndex ?? 0}
          total={photos.length}
          onClose={() => setActiveIndex(null)}
          onPrevious={showPrevious}
          onNext={showNext}
          touchStart={touchStart}
          setTouchStart={setTouchStart}
        />
      ) : null}
    </main>
  );
}

function AlbumHero({ event, dateLabel, location, attendeeCount, hostName }: { event: EventRecord | null; dateLabel: string; location: string; attendeeCount: string; hostName: string }) {
  return (
    <header className="mx-auto mt-8 max-w-5xl text-center sm:mt-12">
      <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-[#8d6539]/18 bg-white/60 px-4 py-2 text-xs font-bold uppercase text-[#7a4d25] shadow-[0_12px_35px_rgba(112,73,31,0.10)] backdrop-blur">
        <Heart className="h-4 w-4 fill-[#a85e3a]/20" />
        Shared by the Admin for the Party Hosts
      </div>
      <h1 className="mx-auto max-w-4xl text-5xl font-semibold leading-[0.94] text-[#332315] sm:text-7xl lg:text-8xl">{event?.name ?? "Memory Album"}</h1>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#76583d] sm:text-lg">A little gallery of big memories.</p>
      <div className="mx-auto mt-7 grid max-w-4xl grid-cols-1 gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
        <MetaPill icon={<Calendar className="h-4 w-4" />} label="Date" value={dateLabel} />
        <MetaPill icon={<MapPin className="h-4 w-4" />} label="Location" value={location} />
        <MetaPill icon={<Users className="h-4 w-4" />} label="Attendees" value={attendeeCount} />
        <MetaPill icon={<Heart className="h-4 w-4" />} label="Hosts" value={hostName} />
      </div>
    </header>
  );
}

function GalleryStats({ photos, attendeeCount, dateLabel }: { photos: PhotoRecord[]; attendeeCount: string; dateLabel: string }) {
  const stats = [
    { label: "Uploaded photos", value: photos.length.toLocaleString(), detail: "preserved memories" },
    { label: "Attendees", value: attendeeCount, detail: "in the room" },
    { label: "Event date", value: dateLabel, detail: "the night it happened" },
    { label: "Album access", value: "Hosts", detail: "shared with the hosts" }
  ];
  return (
    <section className="mx-auto mt-10 grid max-w-6xl grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Memory summary">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-[1.5rem] border border-[#7b5731]/12 bg-white/55 p-4 shadow-[0_18px_50px_rgba(92,61,30,0.10)] backdrop-blur sm:p-5">
          <p className="text-xs font-bold uppercase text-[#8b6035]">{stat.label}</p>
          <strong className="mt-2 block text-2xl font-semibold text-[#382718] sm:text-3xl">{stat.value}</strong>
          <span className="mt-1 block text-xs leading-5 text-[#7b6048]">{stat.detail}</span>
        </div>
      ))}
    </section>
  );
}

function HostMessage() {
  return (
    <section className="mx-auto mt-6 max-w-4xl rounded-[1.75rem] border border-[#7b5731]/12 bg-[#fffaf0]/72 px-5 py-5 text-center shadow-[0_18px_50px_rgba(92,61,30,0.10)] backdrop-blur">
      <p className="text-sm font-semibold leading-6 text-[#65452b]">This gallery was prepared for the hosts to relive the night, one memory at a time.</p>
    </section>
  );
}

function PhotoGalleryGrid({ photos, onOpen }: { photos: PhotoRecord[]; onOpen: (index: number) => void }) {
  return (
    <section className="mx-auto mt-10 max-w-7xl" aria-label="Party photo gallery">
      <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
        {photos.map((photo, index) => (
          <PhotoCard key={photo.id} photo={photo} index={index} onOpen={() => onOpen(index)} />
        ))}
      </div>
    </section>
  );
}

function PhotoCard({ photo, index, onOpen }: { photo: PhotoRecord; index: number; onOpen: () => void }) {
  const rotation = ["-rotate-[1.2deg]", "rotate-[0.8deg]", "rotate-[1.5deg]", "-rotate-[0.5deg]"][index % 4];
  return (
    <figure className={`group mb-5 break-inside-avoid rounded-[1.35rem] bg-[#fffdf7] p-2.5 shadow-[0_18px_45px_rgba(77,47,20,0.17)] ring-1 ring-[#7c5930]/10 transition duration-500 hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(77,47,20,0.24)] ${rotation}`}>
      <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-[1rem] bg-[#eadcc9] text-left focus-visible:outline-[#9d6b38]" aria-label={`Open photo ${index + 1}`}>
        <img
          src={photo.thumbnail_url || photo.public_url}
          alt={photo.message || `Party memory ${index + 1}`}
          width={photo.width_px || 320}
          height={photo.height_px || 427}
          loading={index < 4 ? "eager" : "lazy"}
          fetchPriority={index === 0 ? "high" : "auto"}
          decoding="async"
          className="h-auto w-full sepia-[0.16] saturate-[0.92] transition duration-700 group-hover:scale-[1.035]"
        />
      </button>
      <figcaption className="px-2 pb-2 pt-3">
        <p className="line-clamp-2 text-xs leading-5 text-[#755a41]">{photo.message || formatPhotoDate(photo.created_at)}</p>
      </figcaption>
    </figure>
  );
}

function LightboxViewer({
  photo,
  index,
  total,
  onClose,
  onPrevious,
  onNext,
  touchStart,
  setTouchStart
}: {
  photo: PhotoRecord;
  index: number;
  total: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  touchStart: number | null;
  setTouchStart: (value: number | null) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050302]/94 px-4 py-[max(1rem,env(safe-area-inset-top))] text-white backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        if (touchStart === null) return;
        const delta = (event.changedTouches[0]?.clientX ?? touchStart) - touchStart;
        if (Math.abs(delta) > 48) {
          if (delta > 0) onPrevious();
          else onNext();
        }
        setTouchStart(null);
      }}
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close photo viewer" onClick={onClose} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,214,157,0.14),transparent_34rem)]" />
      <div className="relative z-10 flex max-h-[92svh] w-full max-w-6xl flex-col items-center">
        <div className="mb-4 flex w-full items-center justify-between gap-3">
          <span className="rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-bold text-white/82 backdrop-blur">{index + 1} / {total}</span>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white backdrop-blur" aria-label="Close photo viewer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative flex min-h-0 w-full items-center justify-center">
          <button type="button" onClick={onPrevious} className="absolute left-0 z-20 hidden h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white backdrop-blur transition hover:bg-white/18 sm:inline-flex" aria-label="Previous photo">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <img
            src={photo.preview_url || photo.public_url || photo.thumbnail_url}
            alt={photo.message || `Party memory ${index + 1}`}
            width={photo.width_px || 1200}
            height={photo.height_px || 1600}
            decoding="async"
            className="max-h-[76svh] max-w-full rounded-[1.5rem] object-contain shadow-[0_28px_95px_rgba(0,0,0,0.72)] ring-1 ring-white/10"
          />
          <button type="button" onClick={onNext} className="absolute right-0 z-20 hidden h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white backdrop-blur transition hover:bg-white/18 sm:inline-flex" aria-label="Next photo">
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-4 flex gap-3 sm:hidden">
          <button type="button" onClick={onPrevious} className="inline-flex h-11 w-14 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white" aria-label="Previous photo">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={onNext} className="inline-flex h-11 w-14 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white" aria-label="Next photo">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MetaPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-[1.25rem] border border-[#7b5731]/12 bg-white/58 px-4 py-3 shadow-[0_14px_36px_rgba(95,61,26,0.10)] backdrop-blur">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ead5b8] text-[#754a25]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[0.68rem] font-bold uppercase text-[#8b6035]">{label}</span>
        <strong className="block truncate text-sm font-semibold text-[#3a2a1b]">{value}</strong>
      </span>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="mx-auto mt-10 grid max-w-2xl justify-items-center rounded-[1.75rem] border border-[#7b5731]/12 bg-white/60 px-6 py-12 text-center shadow-[0_18px_50px_rgba(92,61,30,0.10)]">
      <Images className="h-8 w-8 text-[#9b6d3d]" />
      <h2 className="mt-4 text-3xl font-semibold text-[#382718]">Opening the album...</h2>
      <p className="mt-3 text-sm leading-6 text-[#76583d]">The memories are being arranged into place.</p>
    </section>
  );
}

function AlbumEmptyState({ locked, message }: { locked: boolean; message: string }) {
  return (
    <section className="mx-auto mt-10 grid max-w-2xl justify-items-center rounded-[1.75rem] border border-[#7b5731]/12 bg-white/60 px-6 py-12 text-center shadow-[0_18px_50px_rgba(92,61,30,0.10)]">
      <Images className="h-8 w-8 text-[#9b6d3d]" />
      <h2 className="mt-4 text-3xl font-semibold text-[#382718]">{locked ? "The film is still developing" : "No memories here yet"}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-[#76583d]">{locked ? "Photos are sealed until the reveal. When the album opens, the hosts can relive the night here." : message}</p>
    </section>
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

function formatEventDate(value?: string) {
  if (!value) return "Date to be remembered";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date to be remembered";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatPhotoDate(value?: string) {
  if (!value) return "Captured moment";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Captured moment";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function eventDetail(event: EventRecord, keys: string[]) {
  const record = event as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString();
  }
  return "";
}
