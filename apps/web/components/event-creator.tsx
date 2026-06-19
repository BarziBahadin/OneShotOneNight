"use client";

import { FormEvent, useState } from "react";
import QRCode from "qrcode";
import { CalendarClock, Copy, QrCode } from "lucide-react";
import { createEvent, guestURL } from "@/lib/api";

type Created = Awaited<ReturnType<typeof createEvent>>;

export function EventCreator() {
  const [created, setCreated] = useState<Created | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const payload: Record<string, unknown> = {
        name: form.get("name"),
        description: form.get("description"),
        mode: form.get("mode"),
        max_guests: Number(form.get("max_guests")),
        max_photos_per_guest: Number(form.get("max_photos_per_guest")),
        offline_upload_grace_hours: Number(form.get("offline_upload_grace_hours")),
        allow_gallery_uploads: form.get("allow_gallery_uploads") === "on",
        prefer_camera_capture: form.get("prefer_camera_capture") === "on",
        allow_immediate_gallery: form.get("allow_immediate_gallery") === "on"
      };
      for (const key of ["starts_at", "ends_at", "reveal_at"]) {
        const value = String(form.get(key) ?? "");
        if (value) payload[key] = new Date(value).toISOString();
      }
      const out = await createEvent(payload);
      const localGuestURL = guestURL(out.event.slug, out.access_token);
      setCreated(out);
      setQr(await QRCode.toDataURL(localGuestURL, { margin: 1, width: 320 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create event");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-frame max-w-5xl">
      <header className="mb-8 flex items-center gap-3">
        <CalendarClock className="h-7 w-7 text-coral" aria-hidden="true" />
        <div>
          <p className="eyebrow text-moss">Host setup</p>
          <h1 className="text-3xl font-black">Create a private event</h1>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] lg:items-start">
        <form onSubmit={onSubmit} suppressHydrationWarning className="surface grid min-w-0 gap-4 p-5">
          <Field label="Event name" name="name" required placeholder="Rana and Dilan's wedding" />
          <label className="grid gap-2 text-sm font-semibold">
            Description
            <textarea name="description" suppressHydrationWarning className="field min-h-24" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Mode
            <select name="mode" defaultValue="delayed_reveal" suppressHydrationWarning className="field">
              <option value="standard_upload">Standard upload</option>
              <option value="disposable_camera">Disposable camera</option>
              <option value="live_gallery">Live gallery</option>
              <option value="delayed_reveal">Delayed reveal</option>
            </select>
          </label>
          <div className="grid min-w-0 gap-4 xl:grid-cols-3">
            <Field label="Starts" name="starts_at" type="datetime-local" />
            <Field label="Ends" name="ends_at" type="datetime-local" />
            <Field label="Reveal" name="reveal_at" type="datetime-local" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guest limit" name="max_guests" type="number" defaultValue="250" min="1" />
            <Field label="Shots per guest" name="max_photos_per_guest" type="number" defaultValue="12" min="1" />
            <Field label="Offline retry hours" name="offline_upload_grace_hours" type="number" defaultValue="24" min="1" max="168" />
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold"><input name="allow_gallery_uploads" type="checkbox" defaultChecked suppressHydrationWarning /> Allow gallery uploads</label>
          <label className="flex items-center gap-3 text-sm font-semibold"><input name="prefer_camera_capture" type="checkbox" defaultChecked suppressHydrationWarning /> Prefer camera capture</label>
          <label className="flex items-center gap-3 text-sm font-semibold"><input name="allow_immediate_gallery" type="checkbox" suppressHydrationWarning /> Show approved photos immediately</label>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button disabled={busy} className="btn-primary px-5 py-3">{busy ? "Creating..." : "Create event"}</button>
        </form>
        <aside className="surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <QrCode className="h-5 w-5 text-coral" aria-hidden="true" />
            <h2 className="font-semibold">QR code and host link</h2>
          </div>
          {created ? (
            <div className="grid gap-4">
              <img src={qr} alt="Guest QR code" className="mx-auto h-72 w-72 rounded-md border border-ink/10 bg-white p-2" />
              <CopyBox label="Guest URL" value={guestURL(created.event.slug, created.access_token)} />
              <a className="btn-ghost px-4 py-3 text-center" href={guestURL(created.event.slug, created.access_token)} target="_blank" rel="noreferrer">
                Open guest page
              </a>
              <a className="btn-dark px-4 py-3 text-center" href={`/admin/events/${created.event.id}`}>
                Open admin moderation
              </a>
            </div>
          ) : (
            <p className="text-sm leading-6 text-ink/70">Create an event to generate a secure guest URL and QR code.</p>
          )}
        </aside>
      </div>
    </main>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...input } = props;
  return <label className="grid min-w-0 gap-2 text-sm font-semibold">{label}<input {...input} suppressHydrationWarning className="field min-w-0 w-full" /></label>;
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-2">
      <label className="text-sm font-semibold">{label}</label>
      <div className="flex gap-2">
        <input readOnly value={value} suppressHydrationWarning onFocus={(event) => event.currentTarget.select()} className="field min-w-0 flex-1 text-sm" />
        <button
          type="button"
          className="btn-ghost p-2"
          onClick={async () => {
            await copyText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
        >
          <Copy className="h-5 w-5" />
        </button>
      </div>
      {copied ? <p className="text-xs font-semibold text-moss">Copied full link</p> : null}
    </div>
  );
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
