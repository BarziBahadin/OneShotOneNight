"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, MoreVertical, Play, Settings, Share2, Trash2, UserX } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import {
  adminEvent,
  adminModeratePhoto,
  adminDownloadPhotoArchive,
  adminResetEventTokens,
  adminSetEventStatus,
  adminUpdateEvent,
  adminUpdateGuest,
  AdminEventDetail,
  EventRecord,
  PhotoRecord,
  publicWebURL
} from "@/lib/api";

type Section = "event" | "guests" | "settings";

export function AdminEventDetailView({ eventID }: { eventID: string }) {
  const [detail, setDetail] = useState<AdminEventDetail | null>(null);
  const [status, setStatus] = useState("Loading...");
  const [section, setSection] = useState<Section>("event");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");

  async function load() {
    try {
      const out = await adminEvent(eventID);
      setDetail(out);
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to load event");
    }
  }

  useEffect(() => {
    load();
  }, [eventID]);

  useEffect(() => {
    if (!detail?.guest_url) return;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(publicWebURL(detail.guest_url), { margin: 1, width: 360 }))
      .then(setQr)
      .catch(() => setQr(""));
  }, [detail?.guest_url]);

  async function updateStatus(next: "open" | "locked" | "deleted") {
    if (next === "deleted" && !window.confirm("Delete this event? Existing guest links will stop working.")) return;
    await adminSetEventStatus(eventID, next);
    if (next === "deleted") {
      window.location.href = "/admin";
      return;
    }
    await load();
  }

  async function startNow() {
    const now = new Date();
    const currentEnd = new Date(detail!.event.ends_at);
    await adminUpdateEvent(eventID, {
      starts_at: now.toISOString(),
      ends_at: new Date(Math.max(currentEnd.getTime(), now.getTime() + 60 * 60 * 1000)).toISOString()
    });
    await adminSetEventStatus(eventID, "open");
    await load();
  }

  async function reopen() {
    await adminUpdateEvent(eventID, { ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    await adminSetEventStatus(eventID, "open");
    await load();
  }

  async function resetLinks() {
    if (!window.confirm("Reset this event's guest QR and host token? Old links will stop working.")) return;
    const out = await adminResetEventTokens(eventID);
    setDetail({ ...detail!, event: out.event, guest_url: out.guest_url });
    setCopied(false);
    setToast("Guest QR and host token reset");
    window.setTimeout(() => setToast(""), 2200);
  }

  if (!detail) {
    return <AdminShell><p className="surface px-4 py-3 text-moss">{status}</p></AdminShell>;
  }

  const phase = eventPhase(detail.event);
  const guestLink = publicWebURL(detail.guest_url);
  const galleryLink = hostGalleryURL(detail.event, guestLink);
  return (
    <AdminShell>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b hairline pb-8">
        <div>
          <p className="eyebrow">{phase.label}</p>
          <h2 className="editorial-title mt-3">{detail.event.name}</h2>
          <p className="mt-4 text-sm text-moss">{formatSchedule(detail.event)}</p>
        </div>
        <details className="relative">
          <summary className="btn-ghost cursor-pointer list-none p-3" aria-label="Event actions">
            <MoreVertical className="h-5 w-5" />
          </summary>
          <div className="surface absolute right-0 z-20 mt-2 grid w-56 gap-1 p-2">
            {phase.kind === "upcoming" ? <Action onClick={startNow}><Play className="h-4 w-4" /> Start now</Action> : null}
            {phase.kind === "ended" ? <Action onClick={reopen}><Play className="h-4 w-4" /> Reopen for one hour</Action> : null}
            {detail.event.status === "open" ? (
              <Action onClick={() => updateStatus("locked")}>Pause guest access</Action>
            ) : (
              <Action onClick={() => updateStatus("open")}>Resume guest access</Action>
            )}
            <Action onClick={resetLinks}>Reset QR and tokens</Action>
            <Action danger onClick={() => updateStatus("deleted")}><Trash2 className="h-4 w-4" /> Delete event</Action>
          </div>
        </details>
      </header>

      <nav className="mb-8 flex gap-1 overflow-x-auto border-b hairline">
        {([["event", "Event"], ["guests", `Guests (${detail.guests.length})`], ["settings", "Settings"]] as [Section, string][]).map(([value, label]) => (
          <button key={value} onClick={() => setSection(value)} className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${section === value ? "border-amber text-ink" : "border-transparent text-moss hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </nav>

      {section === "event" ? (
        <EventWorkspace detail={detail} guestLink={guestLink} galleryLink={galleryLink} qr={qr} copied={copied} onCopied={() => {
          copyText(guestLink);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }} onToast={(message) => {
          setToast(message);
          window.setTimeout(() => setToast(""), 1800);
        }} onChange={load} />
      ) : null}
      {section === "guests" ? <Guests detail={detail} onChange={load} /> : null}
      {section === "settings" ? <SettingsPanel event={detail.event} onChange={load} /> : null}
      {status ? <p className="mt-4 surface px-4 py-3 text-moss">{status}</p> : null}
      {toast ? <button type="button" onClick={() => setToast("")} className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-sm rounded-full bg-white px-4 py-3 text-sm font-bold text-black shadow-2xl">{toast}</button> : null}
    </AdminShell>
  );
}

function EventWorkspace({ detail, guestLink, galleryLink, qr, copied, onCopied, onToast, onChange }: {
  detail: AdminEventDetail;
  guestLink: string;
  galleryLink: string;
  qr: string;
  copied: boolean;
  onCopied: () => void;
  onToast: (message: string) => void;
  onChange: () => Promise<void>;
}) {
  const photos = useMemo(
    () => detail.photos.filter((photo) => photo.status !== "deleted").sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [detail.photos]
  );
  const guestNames = useMemo(
    () => new Map(detail.guests.map((guest, index) => [guest.id, guest.display_name?.trim() || `Guest ${index + 1}`])),
    [detail.guests]
  );

  async function downloadPhotos() {
    const blob = await adminDownloadPhotoArchive(detail.event.id);
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${detail.event.slug}-photos.zip`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function moderate(photoID: string, status: PhotoRecord["status"]) {
    await adminModeratePhoto(detail.event.id, photoID, status);
    await onChange();
  }

  async function shareGuestLink() {
    try {
      if (navigator.share) {
        await navigator.share({ title: detail.event.name, url: guestLink });
        onToast("Share sheet opened.");
      } else {
        await copyText(guestLink);
        onToast("Guest link copied.");
      }
    } catch {
      onToast("Could not share this guest link.");
    }
  }

  function saveQR() {
    if (!qr) return;
    const anchor = document.createElement("a");
    anchor.href = qr;
    anchor.download = `${detail.event.slug}-qr.png`;
    anchor.click();
    onToast("QR image saved.");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[350px_minmax(0,1fr)] lg:items-start">
      <aside className="scene-glass relative overflow-hidden rounded-[2rem] p-6 text-white lg:sticky lg:top-5">
        <img src="/pics/golden-event.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-24" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/90" />
        <div className="relative">
          <p className="text-[0.68rem] font-bold uppercase text-white/52">Upload QR code</p>
          <h3 className="mt-3 text-4xl font-semibold leading-[0.92]">Scan. Shoot.<br />Remember.</h3>
          <p className="mt-3 text-sm leading-6 text-white/58">Guests can send one photo or many photos by scanning this code. No app download is required.</p>
        </div>
        <div>
        </div>
        {qr ? <img src={qr} alt="Guest QR code" width="360" height="360" decoding="async" className="relative mx-auto my-6 aspect-square w-full max-w-64 rounded-[1.5rem] bg-white p-3 shadow-xl" /> : null}
        <div className="relative grid grid-cols-2 gap-2">
          <button className="rounded-full bg-white px-4 py-3 text-sm font-bold text-black" onClick={shareGuestLink}>
            <Share2 className="mr-1 inline h-4 w-4" /> Share
          </button>
          <button className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-bold text-white" onClick={saveQR}>
            <Download className="mr-1 inline h-4 w-4" /> Save QR
          </button>
        </div>
        <div className="relative mt-3 grid gap-2">
          <a className="btn-primary px-4 py-3" href={galleryLink} target="_blank" rel="noreferrer">
            <Eye className="h-4 w-4" /> Open host gallery
          </a>
          <button className="btn-ghost px-4 py-3" onClick={onCopied}>
            <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy upload link"}
          </button>
        </div>
        <p className="relative mt-4 break-all text-[0.65rem] text-white/40">{guestLink}</p>
      </aside>

      <div className="grid gap-5">
        <section className="grid grid-cols-2 border-y hairline sm:grid-cols-4">
          <Metric label="Guests" value={detail.guests.length} />
          <Metric label="Photos" value={photos.length} />
          <Metric label="Hidden" value={photos.filter((photo) => photo.status === "hidden").length} />
          <Metric label="Storage" value={formatBytes(detail.stats.storage_bytes)} />
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Latest activity</p>
              <h3 className="text-2xl font-bold">Event photos</h3>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-sm text-moss">{detail.event.auto_approve_photos ? "Publishing automatically" : "Manual approval"}</span>
              {photos.length ? (
                <button className="btn-ghost px-4 py-2" type="button" onClick={() => void downloadPhotos()}>
                  <Download className="h-4 w-4" /> Download all
                </button>
              ) : null}
            </div>
          </div>
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {photos.map((photo) => (
              <article key={photo.id} className="surface mb-4 break-inside-avoid overflow-hidden">
                <img
                  src={photo.thumbnail_url || photo.public_url}
                  alt={photo.message || "Event upload"}
                  width={photo.width_px || 768}
                  height={photo.height_px || 1024}
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full bg-skywash"
                />
                <div className="grid gap-3 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded-md bg-skywash px-2 py-1 font-semibold">{photo.status}</span>
                    <span className="text-moss">{new Date(photo.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm font-semibold">
                    Uploaded by {photo.guest_name?.trim() || (photo.guest_id ? guestNames.get(photo.guest_id) : "") || "Guest"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {photo.status === "pending" ? (
                      <IconButton label="Approve" onClick={() => moderate(photo.id, "approved")}><Check className="h-5 w-5" /></IconButton>
                    ) : null}
                    {photo.status === "hidden" ? (
                      <IconButton label="Show" onClick={() => moderate(photo.id, "approved")}><Check className="h-5 w-5" /></IconButton>
                    ) : (
                      <IconButton label="Hide" onClick={() => moderate(photo.id, "hidden")}><EyeOff className="h-5 w-5" /></IconButton>
                    )}
                    <IconButton label="Delete" onClick={() => moderate(photo.id, "deleted")}><Trash2 className="h-5 w-5" /></IconButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!photos.length ? <p className="surface px-4 py-6 text-center text-moss">Photos will appear here as guests upload them.</p> : null}
        </section>
      </div>
    </div>
  );
}

function Guests({ detail, onChange }: { detail: AdminEventDetail; onChange: () => Promise<void> }) {
  const guestDisplayNames = new Set(detail.guests.map((guest) => guest.display_name?.trim()).filter(Boolean));
  const mediaGuestNames = Array.from(
    new Set(
      detail.photos
        .map((photo) => photo.guest_name?.trim())
        .filter((name): name is string => Boolean(name) && !guestDisplayNames.has(name))
    )
  );

  async function toggle(id: string, blocked: boolean) {
    await adminUpdateGuest(detail.event.id, id, blocked ? "active" : "blocked");
    await onChange();
  }
  return (
    <section className="grid gap-3">
      {detail.guests.map((guest, index) => (
        <article key={guest.id} className="surface flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <h3 className="font-semibold">{guest.display_name?.trim() || `Guest ${index + 1}`}</h3>
            <p className="mt-1 text-sm text-moss">{guest.upload_count} uploads · last active {new Date(guest.last_seen_at).toLocaleString()}</p>
          </div>
          <button onClick={() => toggle(guest.id, guest.status === "blocked")} className="btn-ghost px-3 py-2">
            <UserX className="h-4 w-4" /> {guest.status === "blocked" ? "Unblock" : "Block"}
          </button>
        </article>
      ))}
      {mediaGuestNames.map((name) => (
        <article key={name} className="surface flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <h3 className="font-semibold">{name}</h3>
            <p className="mt-1 text-sm text-moss">Uploaded through photo upload</p>
          </div>
        </article>
      ))}
      {!detail.guests.length && !mediaGuestNames.length ? <p className="surface px-4 py-6 text-center text-moss">No guests have joined yet.</p> : null}
    </section>
  );
}

function SettingsPanel({ event, onChange }: { event: EventRecord; onChange: () => Promise<void> }) {
  const [saved, setSaved] = useState(false);
  async function submit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const form = new FormData(submitEvent.currentTarget);
    await adminUpdateEvent(event.id, {
      name: form.get("name"),
      description: form.get("description"),
      starts_at: new Date(String(form.get("starts_at"))).toISOString(),
      ends_at: new Date(String(form.get("ends_at"))).toISOString(),
      reveal_at: new Date(String(form.get("reveal_at"))).toISOString(),
      max_guests: Number(form.get("max_guests")),
      max_photos_per_guest: Number(form.get("max_photos_per_guest")),
      offline_upload_grace_hours: Number(form.get("offline_upload_grace_hours")),
      allow_gallery_uploads: form.get("allow_gallery_uploads") === "on",
      prefer_camera_capture: form.get("prefer_camera_capture") === "on",
      auto_approve_photos: form.get("auto_approve_photos") === "on"
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
    await onChange();
  }
  return (
    <form onSubmit={submit} className="surface grid max-w-3xl gap-4 p-5">
      <Field label="Event name" name="name" defaultValue={event.name} required />
      <label className="grid gap-2 text-sm font-semibold">Description<textarea name="description" defaultValue={event.description} className="field min-h-24" /></label>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Starts" name="starts_at" type="datetime-local" defaultValue={toLocalInput(event.starts_at)} required />
        <Field label="Ends" name="ends_at" type="datetime-local" defaultValue={toLocalInput(event.ends_at)} required />
        <Field label="Gallery reveal" name="reveal_at" type="datetime-local" defaultValue={toLocalInput(event.reveal_at)} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Guest limit" name="max_guests" type="number" min="1" defaultValue={event.max_guests} />
        <Field label="Photos per guest" name="max_photos_per_guest" type="number" min="1" defaultValue={event.max_photos_per_guest} />
        <Field label="Offline retry hours" name="offline_upload_grace_hours" type="number" min="1" max="168" defaultValue={event.offline_upload_grace_hours || 24} />
      </div>
      <label className="flex items-center gap-3 text-sm font-semibold"><input name="allow_gallery_uploads" type="checkbox" defaultChecked={event.allow_gallery_uploads} /> Allow gallery uploads</label>
      <label className="flex items-center gap-3 text-sm font-semibold"><input name="prefer_camera_capture" type="checkbox" defaultChecked={event.prefer_camera_capture} /> Prefer camera capture</label>
      <label className="flex items-center gap-3 text-sm font-semibold"><input name="auto_approve_photos" type="checkbox" defaultChecked={event.auto_approve_photos} /> Publish uploads automatically</label>
      <div className="flex items-center gap-3">
        <button className="btn-primary px-5 py-3"><Settings className="h-5 w-5" /> Save settings</button>
        {saved ? <span className="text-sm font-semibold text-amber">Saved</span> : null}
      </div>
    </form>
  );
}

function eventPhase(event: EventRecord) {
  const now = Date.now();
  if (now >= new Date(event.ends_at).getTime()) return { kind: "ended", label: "Finished" };
  if (event.status === "locked") return { kind: "paused", label: "Paused" };
  if (now < new Date(event.starts_at).getTime()) return { kind: "upcoming", label: "Upcoming" };
  return { kind: "live", label: "Live now" };
}

function formatSchedule(event: EventRecord) {
  return `${new Date(event.starts_at).toLocaleString()} to ${new Date(event.ends_at).toLocaleString()}`;
}

function hostGalleryURL(event: EventRecord, guestLink: string) {
  try {
    const url = new URL(guestLink);
    const token = url.searchParams.get("token") || url.searchParams.get("t") || "";
    return publicWebURL(`/gallery/${event.slug}${token ? `?t=${encodeURIComponent(token)}` : ""}`);
  } catch {
    return publicWebURL(`/gallery/${event.slug}`);
  }
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...input } = props;
  return <label className="grid min-w-0 gap-2 text-sm font-semibold">{label}<input {...input} className="field min-w-0 w-full" /></label>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="border-r hairline px-4 py-5 last:border-r-0"><p className="text-xs uppercase tracking-widest text-moss">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button aria-label={label} title={label} onClick={onClick} className="btn-ghost p-3">{children}</button>;
}

function Action({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold hover:bg-skywash ${danger ? "text-red-300" : ""}`}>{children}</button>;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
