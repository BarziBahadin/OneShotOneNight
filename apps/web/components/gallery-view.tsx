"use client";

import { useEffect, useState } from "react";
import { guestGallery, PhotoRecord } from "@/lib/api";

export function GalleryView({ slug, accessToken }: { slug: string; accessToken: string }) {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [title, setTitle] = useState("Gallery");
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    guestGallery(slug, accessToken).then((out) => {
      setTitle(out.event.name);
      setPhotos(out.photos);
      setStatus(out.photos.length ? "" : "No approved photos yet.");
    }).catch((err: Error) => {
      setStatus(err.message.includes("reveal_not_reached") ? "Film is still developing. This gallery unlocks at the host's reveal time." : err.message);
    });
  }, [slug, accessToken]);

  return (
    <main className="app-frame max-w-7xl">
      <header className="mb-12 border-b hairline pb-10 pt-6 text-center">
        <p className="eyebrow">The photographs</p>
        <h1 className="editorial-title mx-auto mt-4 max-w-3xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-xl leading-7 text-moss">A night seen through everyone who was there.</p>
      </header>
      {status ? <p className="py-20 text-center text-moss">{status}</p> : null}
      <div className="columns-1 gap-5 sm:columns-2 lg:columns-3">
        {photos.map((photo) => (
          <figure key={photo.id} className="mb-5 break-inside-avoid overflow-hidden rounded-[1.5rem] bg-white/[0.035]">
            <img src={photo.public_url} alt={photo.message || "Event photo"} className="w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
            {photo.message ? <figcaption className="p-4 text-sm italic text-moss">{photo.message}</figcaption> : null}
          </figure>
        ))}
      </div>
    </main>
  );
}
