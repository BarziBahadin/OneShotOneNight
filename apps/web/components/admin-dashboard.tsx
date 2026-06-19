"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { adminEvents, AdminEventSummary } from "@/lib/api";
import { AdminShell } from "@/components/admin-shell";

export function AdminDashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [status, setStatus] = useState("Loading events...");

  useEffect(() => {
    adminEvents()
      .then((out) => {
        setEvents(out.events.filter((item) => item.event.status !== "deleted"));
        setStatus("");
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "unauthorized") navigate("/admin/login", { replace: true });
        else setStatus(err instanceof Error ? err.message : "Unable to load events");
      });
  }, [navigate]);

  const groups = useMemo(() => {
    const now = Date.now();
    return {
      live: events.filter(({ event }) => event.status === "open" && now >= Date.parse(event.starts_at) && now < Date.parse(event.ends_at)),
      upcoming: events.filter(({ event }) => event.status === "open" && now < Date.parse(event.starts_at)),
      finished: events.filter(({ event }) => now >= Date.parse(event.ends_at) || event.status === "locked")
    };
  }, [events]);

  return (
    <AdminShell>
      <section className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your events</p>
          <h2 className="editorial-title mt-3">Every night,<br />in one place.</h2>
          <p className="mt-5 max-w-lg leading-7 text-moss">Prepare the guest camera, share the invitation, and watch the story of the event take shape.</p>
        </div>
        <Link className="btn-primary px-5 py-3" to="/admin/events/new"><Plus className="h-5 w-5" /> Create event</Link>
      </section>

      {status ? <p className="surface px-4 py-3 text-moss">{status}</p> : null}
      {!status && events.length === 0 ? (
        <section className="surface grid min-h-[420px] justify-items-center content-center gap-5 px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-coral/15 text-coral"><Plus className="h-7 w-7" /></div>
          <div>
            <h3 className="text-2xl font-bold">Create your first event</h3>
            <p className="mt-2 text-moss">You’ll get a guest QR code as soon as it is created.</p>
          </div>
          <Link className="btn-primary px-5 py-3" to="/admin/events/new">Create event</Link>
        </section>
      ) : null}

      <div className="mt-14 grid gap-14">
        <EventGroup title="Live now" items={groups.live} empty="No events are live right now." />
        <EventGroup title="Upcoming" items={groups.upcoming} empty="No upcoming events." />
        <EventGroup title="Finished and paused" items={groups.finished} empty="No finished events yet." />
      </div>
    </AdminShell>
  );
}

function EventGroup({ title, items, empty }: { title: string; items: AdminEventSummary[]; empty: string }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="mb-5 flex items-center gap-4">
        <h3 className="text-xl font-semibold">{title}</h3>
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-moss">{items.length}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {items.map((item) => (
          <Link key={item.event.id} to={`/admin/events/${item.event.id}`} className="surface group relative min-h-56 overflow-hidden p-6 sm:p-7">
            <div className="absolute -right-14 -top-16 h-52 w-52 rounded-full bg-coral/10 blur-3xl transition-transform duration-500 group-hover:scale-125" />
            <div className="relative flex h-full flex-col justify-between gap-12">
              <div className="flex items-start justify-between gap-4">
                <p className="eyebrow">{new Date(item.event.starts_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
                <ArrowRight className="h-5 w-5 text-moss transition-all group-hover:translate-x-1 group-hover:text-coral" />
              </div>
              <div>
                <h4 className="text-3xl font-semibold leading-tight">{item.event.name}</h4>
                <p className="mt-4 text-sm text-moss">{item.guest_count} guests <span className="mx-2 text-white/20">/</span> {item.photo_count} photographs</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {!items.length ? <p className="text-sm text-moss">{empty}</p> : null}
    </section>
  );
}
