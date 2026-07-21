"use client";

import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { adminEvents, AdminEventSummary } from "@/lib/api";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";

export function AdminEvents() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminEventSummary[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [filter, setFilter] = useState({ q: "", status: "" });

  async function load(next = filter) {
    try {
      const out = await adminEvents(next);
      setItems(out.events);
      setStatus(out.events.length ? "" : "No events found.");
    } catch (err) {
      if (err instanceof Error && err.message === "unauthorized") navigate("/admin/login", { replace: true });
      setStatus(err instanceof Error ? err.message : "Unable to load events");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = { q: String(form.get("q") ?? ""), status: String(form.get("status") ?? "") };
    setFilter(next);
    load(next);
  }

  return (
    <AdminShell>
      <form onSubmit={onSubmit} className="surface mb-5 flex flex-wrap gap-2 p-3">
        <Input name="q" placeholder="Search events" aria-label="Search events" className="min-w-52 flex-1" />
        <NativeSelect
          name="status"
          aria-label="Event status"
          className="w-auto min-w-40"
          options={[
            { value: "", label: "All statuses" },
            { value: "upcoming", label: "Upcoming" },
            { value: "open", label: "Open" },
            { value: "locked", label: "Locked" },
            { value: "deleted", label: "Deleted" }
          ]}
        />
        <Button type="submit" color="secondary" size="md" iconLeading={Search}>Search</Button>
      </form>
      {status ? <p className="surface px-4 py-3 text-ink/70">{status}</p> : null}
      <div className="grid gap-3">
        {items.map((item) => (
          <Link key={item.event.id} to={`/admin/events/${item.event.id}`} className="surface grid gap-3 p-4 lg:grid-cols-[1fr_repeat(4,auto)] lg:items-center">
            <div>
              <h2 className="font-semibold">{item.event.name}</h2>
              <p className="mt-1 text-sm text-ink/60">{item.event.slug}</p>
            </div>
            <Badge>{item.event.status}</Badge>
            <span className="text-sm">{item.guest_count} guests</span>
            <span className="text-sm">{item.photo_count} photos</span>
            <span className="text-sm">{item.pending_photos} pending</span>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="w-fit rounded-md bg-skywash px-2 py-1 text-sm font-semibold">{children}</span>;
}
