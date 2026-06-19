"use client";

import { useEffect, useState } from "react";
import { Check, Download, EyeOff, Trash2 } from "lucide-react";
import { EventRecord, hostPhotos, moderatePhoto, PhotoRecord } from "@/lib/api";

export function HostModeration({ slug, organizerToken }: { slug: string; organizerToken: string }) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [status, setStatus] = useState("Loading...");

  async function load() {
    try {
      const out = await hostPhotos(slug, organizerToken);
      setEvent(out.event);
      setPhotos(out.photos);
      setStatus(out.photos.length ? "" : "No uploads yet.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to load moderation");
    }
  }

  useEffect(() => {
    load();
  }, [slug, organizerToken]);

  async function setPhotoStatus(photoID: string, next: PhotoRecord["status"]) {
    if (!event) return;
    await moderatePhoto(event.id, photoID, organizerToken, next);
    await load();
  }

  function downloadManifest() {
    const blob = new Blob([JSON.stringify({ event, photos }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event?.slug ?? "event"}-photos.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-frame max-w-6xl">
      <header className="surface mb-6 flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="eyebrow">Host moderation</p>
          <h1 className="text-3xl font-black">{event?.name ?? "Event photos"}</h1>
        </div>
        <button onClick={downloadManifest} className="btn-dark px-4 py-2">
          <Download className="h-5 w-5" /> Download manifest
        </button>
      </header>
      {event ? (
        <section className="mb-5 grid gap-3 sm:grid-cols-4">
          <Metric label="Photos" value={photos.length} />
          <Metric label="Approved" value={photos.filter((p) => p.status === "approved").length} />
          <Metric label="Pending" value={photos.filter((p) => p.status === "pending").length} />
          <Metric label="Storage" value={`${(photos.reduce((sum, p) => sum + p.size_bytes, 0) / 1024 / 1024).toFixed(1)} MB`} />
        </section>
      ) : null}
      {status ? <p className="surface px-4 py-3 text-ink/75">{status}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => (
          <article key={photo.id} className="surface overflow-hidden">
            <img src={photo.public_url} alt={photo.message || "Event upload"} className="aspect-[4/3] w-full object-cover" />
            <div className="grid gap-3 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-skywash px-2 py-1 text-xs font-semibold">{photo.status}</span>
                <span className="text-xs text-ink/60">{new Date(photo.created_at).toLocaleString()}</span>
              </div>
              {photo.message ? <p className="text-sm text-ink/70">{photo.message}</p> : null}
              <div className="grid grid-cols-3 gap-2">
                <IconButton label="Approve" onClick={() => setPhotoStatus(photo.id, "approved")}><Check className="h-5 w-5" /></IconButton>
                <IconButton label="Hide" onClick={() => setPhotoStatus(photo.id, "hidden")}><EyeOff className="h-5 w-5" /></IconButton>
                <IconButton label="Delete" onClick={() => setPhotoStatus(photo.id, "deleted")}><Trash2 className="h-5 w-5" /></IconButton>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="surface p-4"><p className="text-sm text-ink/60">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button aria-label={label} title={label} onClick={onClick} className="btn-ghost p-3">{children}</button>;
}
