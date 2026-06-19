"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, EyeOff, ExternalLink, MoreVertical, Play, Settings, Trash2, UserX } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import {
  adminEvent,
  adminModeratePhoto,
  adminPhotoArchiveURL,
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
    QRCode.toDataURL(publicWebURL(detail.guest_url), { margin: 1, width: 360 }).then(setQr).catch(() => setQr(""));
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

  if (!detail) {
    return <AdminShell><p className="surface px-4 py-3 text-moss">{status}</p></AdminShell>;
  }

  const phase = eventPhase(detail.event);
  const guestLink = publicWebURL(detail.guest_url);
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
        <EventWorkspace detail={detail} guestLink={guestLink} qr={qr} copied={copied} onCopied={() => {
          copyText(guestLink);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }} onChange={load} />
      ) : null}
      {section === "guests" ? <Guests detail={detail} onChange={load} /> : null}
      {section === "settings" ? <SettingsPanel event={detail.event} onChange={load} /> : null}
      {status ? <p className="mt-4 surface px-4 py-3 text-moss">{status}</p> : null}
    </AdminShell>
  );
}

function EventWorkspace({ detail, guestLink, qr, copied, onCopied, onChange }: {
  detail: AdminEventDetail;
  guestLink: string;
  qr: string;
  copied: boolean;
  onCopied: () => void;
  onChange: () => Promise<void>;
}) {
  const photos = useMemo(
    () => detail.photos.filter((photo) => photo.status !== "deleted").sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [detail.photos]
  );

  async function moderate(photoID: string, status: PhotoRecord["status"]) {
    await adminModeratePhoto(detail.event.id, photoID, status);
    await onChange();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[350px_minmax(0,1fr)] lg:items-start">
      <aside className="relative overflow-hidden rounded-[2rem] bg-[#eee7dc] p-6 text-[#171411] shadow-[0_30px_80px_rgba(0,0,0,0.28)] lg:sticky lg:top-5">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber/25 blur-3xl" />
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#8b6b32]">Guest invitation</p>
          <h3 className="mt-3 text-3xl font-semibold leading-tight">Scan. Shoot.<br />Remember.</h3>
        </div>
        {qr ? <img src={qr} alt="Guest QR code" className="relative mx-auto my-6 aspect-square w-full max-w-64 rounded-2xl bg-white p-3 shadow-xl" /> : null}
        <button className="btn-primary px-4 py-3" onClick={onCopied}>
          <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy guest link"}
        </button>
        <a className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/15 px-4 py-3 text-sm font-semibold hover:bg-black/5" href={guestLink} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" /> Open guest view
        </a>
        <p className="break-all text-[0.65rem] text-black/45">{guestLink}</p>
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
                <a className="btn-ghost px-4 py-2" href={adminPhotoArchiveURL(detail.event.id)} download>
                  <Download className="h-4 w-4" /> Download all
                </a>
              ) : null}
            </div>
          </div>
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {photos.map((photo) => (
              <article key={photo.id} className="surface mb-4 break-inside-avoid overflow-hidden">
                <img src={photo.public_url} alt={photo.message || "Event upload"} className="w-full bg-skywash object-cover" />
                <div className="grid gap-3 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded-md bg-skywash px-2 py-1 font-semibold">{photo.status}</span>
                    <span className="text-moss">{new Date(photo.created_at).toLocaleString()}</span>
                  </div>
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
  async function toggle(id: string, blocked: boolean) {
    await adminUpdateGuest(detail.event.id, id, blocked ? "active" : "blocked");
    await onChange();
  }
  return (
    <section className="grid gap-3">
      {detail.guests.map((guest, index) => (
        <article key={guest.id} className="surface flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <h3 className="font-semibold">Guest {index + 1}</h3>
            <p className="mt-1 text-sm text-moss">{guest.upload_count} uploads · last active {new Date(guest.last_seen_at).toLocaleString()}</p>
          </div>
          <button onClick={() => toggle(guest.id, guest.status === "blocked")} className="btn-ghost px-3 py-2">
            <UserX className="h-4 w-4" /> {guest.status === "blocked" ? "Unblock" : "Block"}
          </button>
        </article>
      ))}
      {!detail.guests.length ? <p className="surface px-4 py-6 text-center text-moss">No guests have joined yet.</p> : null}
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
