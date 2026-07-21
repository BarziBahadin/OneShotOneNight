"use client";

import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChevronDown } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { adminCreateEvent } from "@/lib/api";

export function AdminEventCreator() {
  const navigate = useNavigate();
  const defaults = useMemo(() => defaultSchedule(), []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const startsAt = new Date(String(form.get("starts_at")));
    const endsAt = new Date(String(form.get("ends_at")));
    const reveal = String(form.get("gallery_reveal"));

    try {
      const out = await adminCreateEvent({
        name: form.get("name"),
        description: form.get("description"),
        mode: reveal === "during" ? "live_gallery" : "delayed_reveal",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        reveal_at: (reveal === "during" ? startsAt : endsAt).toISOString(),
        max_guests: Number(form.get("max_guests")),
        max_photos_per_guest: Number(form.get("max_photos_per_guest")),
        offline_upload_grace_hours: Number(form.get("offline_upload_grace_hours")),
        allow_gallery_uploads: form.get("allow_gallery_uploads") === "on",
        prefer_camera_capture: form.get("prefer_camera_capture") === "on",
        allow_immediate_gallery: false,
        auto_approve_photos: true
      });
      navigate(`/admin/events/${out.event.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create event");
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
        <header className="lg:sticky lg:top-10">
          <p className="eyebrow">New event</p>
          <h2 className="editorial-title mt-4">Set the scene.</h2>
          <p className="mt-5 max-w-sm leading-7 text-moss">A name, a time, and a reveal. We’ll turn it into a private camera guests can open from one beautiful QR code.</p>
        </header>

        <form onSubmit={onSubmit} className="surface grid gap-6 p-6 sm:p-8">
          <Input label="Event name" name="name" isRequired autoFocus placeholder="Rana and Dilan's wedding" size="md" />
          <div className="grid gap-4 sm:grid-cols-2">
            <DateTimePicker label="Starts" name="starts_at" required defaultValue={defaults.start} />
            <DateTimePicker label="Ends" name="ends_at" required defaultValue={defaults.end} />
          </div>
          <NativeSelect
            label="When can guests see the gallery?"
            name="gallery_reveal"
            defaultValue="after"
            options={[
              { value: "after", label: "After the event ends" },
              { value: "during", label: "During the event" }
            ]}
          />

          <details className="border-t hairline pt-5">
            <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
              Advanced settings <ChevronDown className="h-4 w-4" />
            </summary>
            <div className="mt-5 grid gap-4">
              <TextArea label="Description" name="description" textAreaClassName="min-h-24" placeholder="Optional welcome message" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Guest limit" name="max_guests" type="number" defaultValue="250" min="1" />
                <Input label="Photos per guest" name="max_photos_per_guest" type="number" defaultValue="12" min="1" />
                <Input label="Offline retry hours" name="offline_upload_grace_hours" type="number" defaultValue="24" min="1" max="168" />
              </div>
              <Checkbox name="allow_gallery_uploads" defaultSelected label="Let guests choose existing photos" />
              <Checkbox name="prefer_camera_capture" defaultSelected label="Open the camera first" />
            </div>
          </details>

          {error ? <p className="rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p> : null}
          <Button type="submit" size="md" isDisabled={busy} isLoading={busy} showTextWhileLoading iconLeading={CalendarClock}>
            {busy ? "Creating event..." : "Create event and get QR"}
          </Button>
        </form>
      </div>
    </AdminShell>
  );
}

function defaultSchedule() {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
