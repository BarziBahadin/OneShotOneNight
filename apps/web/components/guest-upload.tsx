"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Check, Images, LockKeyhole, ShieldCheck, Sparkles, UploadCloud, X } from "lucide-react";
import { FileUpload } from "@/components/application/file-upload/file-upload-base";
import { EventRecord, joinGuest, rememberGuestAccessToken, storedGuestAccessToken, uploadGuestPhoto } from "@/lib/api";

type UploadResult = {
  name: string;
  ok: boolean;
  message: string;
};

export function GuestUpload({ slug, accessToken }: { slug: string; accessToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [status, setStatus] = useState("Opening upload link...");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [currentUpload, setCurrentUpload] = useState<File | null>(null);
  const [guestName, setGuestName] = useState("");
  const autoJoinAttempted = useRef(false);
  const activeToken = useMemo(() => normalizeToken(accessToken) || storedGuestAccessToken(slug), [accessToken, slug]);

  useEffect(() => {
    if (autoJoinAttempted.current || !activeToken) return;
    rememberGuestAccessToken(slug, activeToken);
    autoJoinAttempted.current = true;
    void join();
  }, [activeToken]);

  async function join() {
    setBusy(true);
    setStatus("");
    try {
      const out = await joinGuest(slug, activeToken, "");
      setEvent(out.event);
      setRemaining(out.remaining_shots);
    } catch (err) {
      setStatus(err instanceof Error ? friendlyJoinError(err.message) : "Unable to open this upload link.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || !event) return;
    const displayName = guestName.trim();

    if (!displayName) {
      setStatus("Please enter your name before uploading photos.");
      return;
    }

    const availableSlots = remaining ?? event.max_photos_per_guest;
    const uploadableFiles = files.filter((file) => file.size > 0).slice(0, availableSlots);

    if (!uploadableFiles.length) {
      setStatus(availableSlots <= 0 ? "You’ve used all your photo uploads for this event." : "Choose at least one photo to upload.");
      return;
    }

    setUploading(true);
    setStatus(files.length > uploadableFiles.length ? `Uploading the first ${uploadableFiles.length} photos allowed for this event.` : "");
    setResults([]);
    setBatchDone(0);
    setBatchTotal(uploadableFiles.length);

    const nextResults: UploadResult[] = [];
    let latestRemaining = availableSlots;

    for (const file of uploadableFiles) {
      setCurrentUpload(file);
      try {
        const out = await uploadGuestPhoto(slug, activeToken, file, "", displayName);
        latestRemaining = out.remaining_shots;
        setRemaining(out.remaining_shots);
        nextResults.push({ name: file.name, ok: true, message: "Uploaded" });
      } catch (err) {
        nextResults.push({
          name: file.name,
          ok: false,
          message: err instanceof Error ? friendlyJoinError(err.message) : "Upload failed"
        });
      } finally {
        setBatchDone((value) => value + 1);
        setResults([...nextResults]);
      }
    }

    setRemaining(latestRemaining);
    setUploading(false);
    setCurrentUpload(null);
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
            <p className="reveal-kicker">Photo upload</p>
            <h1 className="mt-3 font-serif text-3xl font-semibold">{busy ? "Opening..." : "Upload link unavailable"}</h1>
            <p className="mt-3 text-sm leading-6 text-white/60">{status || "Preparing your private upload page."}</p>
          </div>
          {!busy && status ? <button type="button" onClick={() => void join()} className="reveal-light-button">Try again</button> : null}
        </div>
      </main>
    );
  }

  const maxPhotos = event.max_photos_per_guest;
  const shotsRemaining = remaining ?? maxPhotos;
  const uploadedCount = Math.max(maxPhotos - shotsRemaining, 0);
  const progress = batchTotal > 0 ? Math.round((batchDone / batchTotal) * 100) : 0;
  const canUpload = Boolean(guestName.trim()) && !uploading && shotsRemaining > 0;
  const hostDescription = (event.description || event.host_message || "").trim();

  return (
    <main className="reveal-page">
      <img src="/pics/golden-event.jpg" alt="A candlelit dinner table at sunset" className="reveal-bg" />
      <div className="reveal-vignette" />
      {uploading ? <UploadLoadingScreen progress={progress} file={currentUpload} batchDone={batchDone} batchTotal={batchTotal} /> : null}

      <section className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[520px] flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-end">
          <span className="reveal-chip"><LockKeyhole className="h-5 w-5" /> Private upload</span>
        </header>

        <div className="mt-[9vh] sm:mt-[11vh]">
          <p className="reveal-kicker">Send your photos</p>
          <h1 className="mt-3 font-serif text-[2.8rem] font-semibold leading-[0.96] text-white min-[390px]:text-[3.35rem]">{event.name}</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/62">
            {hostDescription || "Upload one photo or select several at once. The host receives them privately for this event."}
          </p>
        </div>

        <section className="mt-8 grid gap-4 rounded-[2rem] border border-white/10 bg-black/64 p-4 shadow-[0_24px_70px_rgb(0_0_0/0.42)] backdrop-blur-2xl">
          <div className="grid gap-3">
            <label htmlFor="guest-upload-name" className="text-sm font-semibold text-white/82">Who is sharing these beautiful moments?</label>
            <input
              id="guest-upload-name"
              value={guestName}
              onChange={(inputEvent) => setGuestName(inputEvent.target.value)}
              type="text"
              inputMode="text"
              autoComplete="name"
              maxLength={100}
              placeholder="Please enter your name here"
              className="min-h-14 rounded-2xl border border-white/12 bg-black/48 px-4 text-base font-medium text-white outline-none transition placeholder:text-white/36 focus:border-blue-400/70 focus:ring-4 focus:ring-blue-500/18"
            />
            <p className="text-xs leading-5 text-white/46">This helps the host know who to thank for each photo.</p>
          </div>

          <FileUpload.DropZone
            isDisabled={!canUpload}
            allowsMultiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            maxSize={10 * 1024 * 1024}
            hint="JPEG, PNG, WebP, HEIC, or HEIF up to 10 MB"
            onDropFiles={(files) => void uploadFiles(Array.from(files))}
            onDropUnacceptedFiles={() => setStatus("Choose a JPEG, PNG, WebP, HEIC, or HEIF photo.")}
            onSizeLimitExceed={() => setStatus("Each photo must be 10 MB or smaller.")}
            className="min-h-48 rounded-[1.5rem] border border-dashed border-white/18 bg-white/[0.06] px-5 py-8 text-center text-white ring-0 disabled:pointer-events-none"
          />

          {uploading ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/14" aria-label={`${progress}% uploaded`}>
              <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <UploadMetric icon={<Images className="h-5 w-5" />} label="Uploaded" value={`${uploadedCount}`} />
            <UploadMetric icon={<ShieldCheck className="h-5 w-5" />} label="Remaining" value={`${shotsRemaining}`} />
          </div>

          {results.length ? (
            <div className="grid gap-2" aria-live="polite">
              {results.slice(-5).map((result) => (
                <p key={`${result.name}-${result.message}`} className={`reveal-notice justify-start text-left ${result.ok ? "text-emerald-100" : "text-red-100"}`}>
                  {result.ok ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{result.name}</span>
                  <span className="shrink-0 text-xs text-white/48">{result.message}</span>
                </p>
              ))}
            </div>
          ) : null}

          {status ? <p className="reveal-notice text-amber-50">{status}</p> : null}
        </section>
      </section>
    </main>
  );
}

function UploadLoadingScreen({ progress, file, batchDone, batchTotal }: { progress: number; file: File | null; batchDone: number; batchTotal: number }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-black/50 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white backdrop-blur-sm" role="status" aria-live="polite">
      <div className="w-full max-w-[520px] rounded-2xl border border-white/10 bg-[#0b0a09]/95 p-4 shadow-[0_-18px_50px_rgb(0_0_0/0.45)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <UploadCloud className="h-5 w-5 animate-pulse" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Uploading photos</p>
            <p className="truncate text-xs text-white/52">{file?.name || (batchTotal ? `${batchDone} of ${batchTotal} complete` : "Preparing upload")}</p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-white/70">{progress}%</p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/14" aria-label={`${progress}% uploaded`}>
          <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{ width: `${Math.max(8, progress)}%` }} />
        </div>
      </div>
    </div>
  );
}

function UploadMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
      <div className="flex items-center justify-between gap-3 text-white/54">
        {icon}
        <span className="text-[0.65rem] font-semibold uppercase text-white/42">{label}</span>
      </div>
      <p className="mt-3 font-serif text-3xl leading-none">{value}</p>
    </div>
  );
}

function normalizeToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("t") ?? url.searchParams.get("token") ?? trimmed;
  } catch {
    return trimmed;
  }
}

function friendlyJoinError(message: string) {
  if (message.includes("event_not_started")) return "This event has not started yet. Come back when the celebration begins.";
  if (message.includes("event_ended")) return "Photo uploads have closed for this event.";
  if (message.includes("event_paused") || message.includes("event_locked")) return "The host has paused photo uploads for now.";
  if (message.includes("upload_limit_reached")) return "You’ve used all your photo uploads for this event.";
  if (message.includes("unauthorized")) return "This upload link is invalid or incomplete. Scan the upload QR code again.";
  return message;
}
