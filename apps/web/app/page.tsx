import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Camera, Images, QrCode, ShieldCheck, Users } from "lucide-react";

const metrics = [
  ["0 accounts", "Guests join from the QR code"],
  ["1 admin", "You control every event"],
  ["3 steps", "Create, share, collect"]
];

const features = [
  [QrCode, "QR-ready events", "Create events ahead of time and keep the guest QR ready before anyone arrives."],
  [Camera, "Camera and gallery uploads", "Guests can use the phone camera, live camera, or choose multiple photos from their gallery."],
  [ShieldCheck, "Host controls", "Photos publish automatically on your schedule, while you can hide or delete anything at any time."],
  [CalendarDays, "Delayed reveal", "Set start, end, and reveal times so the gallery opens exactly when you want."],
  [Users, "Guest controls", "Track guests, shot limits, uploads, and block a guest if you need to."],
  [Images, "Shareable gallery", "Approved photos flow into a polished event gallery for everyone to enjoy."]
];

const steps = [
  ["Create", "Set the event details, future dates, upload limits, and gallery rules."],
  ["Share", "Print or send the QR-ready guest link before the event starts."],
  ["Collect", "Guests scan, join, and upload photos from camera or gallery."],
  ["Reveal", "The gallery opens automatically at the time you chose, with no extra work."]
];

export default function HomePage() {
  return (
    <main className="app-frame flex flex-col gap-10">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b hairline pb-5">
        <Link to="/" className="flex items-center gap-3 font-bold tracking-tight">
          <img src="/app-icon-192.png" alt="" className="h-10 w-10 rounded-xl object-cover shadow-[0_0_18px_rgba(36,99,235,0.24)]" aria-hidden="true" />
          <span>OneShotOneNight</span>
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost text-sm" to="/admin">Admin</Link>
          <Link className="btn-primary text-sm" to="/admin/events/new">Create event</Link>
        </div>
      </nav>

      <section className="grid min-h-[78vh] gap-10 py-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:py-14">
        <div className="relative z-10">
          <p className="eyebrow mb-4">Private event camera</p>
          <h1 className="editorial-title max-w-3xl">Every guest sees a different night.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-moss">
            Create the event, share one QR code, collect guest photos, and reveal a clean gallery automatically when the night is ready.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="btn-primary px-5 py-3" to="/admin/events/new">
              Create an event <ArrowRight className="h-4 w-4" />
            </Link>
            <Link className="btn-dark px-5 py-3" to="/admin">
              Open admin
            </Link>
          </div>
          <div className="mt-10 grid max-w-2xl grid-cols-3 border-y hairline">
            {metrics.map(([value, label]) => (
              <div key={value} className="border-r hairline px-3 py-5 last:border-r-0 sm:px-5">
                <p className="text-lg font-semibold sm:text-xl">{value}</p>
                <p className="mt-1 text-xs leading-5 text-moss sm:text-sm">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <HeroPhotos />
      </section>

      <section className="grid gap-5 py-10 lg:grid-cols-[1.15fr_0.85fr]">
        <figure className="group relative min-h-[520px] overflow-hidden rounded-[2rem]">
          <img src="/pics/jonathan-borba-eg-72fI9wK4-unsplash.jpg" alt="Newlyweds celebrating as their guests throw confetti" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
          <figcaption className="absolute inset-x-0 bottom-0 p-7 sm:p-9">
            <p className="eyebrow">Caught by the people there</p>
            <h2 className="mt-3 max-w-xl text-4xl font-semibold text-white sm:text-5xl">The moments between the planned moments.</h2>
          </figcaption>
        </figure>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <figure className="relative min-h-64 overflow-hidden rounded-[2rem]">
            <img src="/pics/golden-event.jpg" alt="Elegant outdoor event table glowing in golden-hour sunlight" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            <figcaption className="absolute bottom-0 p-6 text-xl font-semibold text-white">Before everyone arrives.</figcaption>
          </figure>
          <figure className="relative min-h-64 overflow-hidden rounded-[2rem]">
            <img src="/pics/andre-hunter-YK46WkDJj8s-unsplash.jpg" alt="Friends celebrating together under colorful party lights" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
            <figcaption className="absolute bottom-0 p-6 text-xl font-semibold text-white">Long after the lights come on.</figcaption>
          </figure>
        </div>
      </section>

      <section id="features" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map(([Icon, title, copy]) => (
          <article key={String(title)} className="surface p-5">
            <Icon className="h-7 w-7 text-coral" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">{title as string}</h2>
            <p className="mt-2 leading-7 text-moss">{copy as string}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="text-3xl font-black leading-tight sm:text-5xl">From empty event to a shared gallery without guest accounts.</h2>
          <p className="mt-4 max-w-xl leading-7 text-ink/70">
            The app is built for real event flow: prepare everything early, let guests upload fast, and keep final control in your hands.
          </p>
        </div>
        <div className="grid gap-3">
          {steps.map(([title, copy], index) => (
            <article key={title} className="surface grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-start">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber text-sm font-semibold text-linen">{index + 1}</div>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 leading-6 text-moss">{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="eyebrow mb-3">Ready before the event</p>
          <h2 className="text-3xl font-black leading-tight">Create future events and keep the QR code ready.</h2>
          <p className="mt-3 max-w-2xl leading-7 text-moss">
            Set the date now, print the QR code, and open the event when guests arrive. Upcoming events stay visible in your admin dashboard.
          </p>
        </div>
        <Link className="btn-primary px-5 py-3" to="/admin/events/new">
          Schedule an event <CalendarDays className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}

function HeroPhotos() {
  return (
    <div className="relative mx-auto h-[580px] w-full max-w-[680px]" aria-hidden="true">
      <div className="absolute inset-y-4 left-[8%] right-[18%] overflow-hidden rounded-[2rem] shadow-[0_35px_100px_rgba(0,0,0,0.45)]">
        <img src="/pics/golden-event.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-amber/5" />
      </div>
      <div className="absolute right-0 top-14 h-[250px] w-[38%] rotate-3 overflow-hidden rounded-[1.5rem] border-4 border-[#eee7dc] shadow-2xl">
        <img src="/pics/sujan-khalifa-LO1lToLGGFA-unsplash.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="absolute bottom-0 left-0 h-[245px] w-[40%] -rotate-3 overflow-hidden rounded-[1.5rem] border-4 border-[#eee7dc] shadow-2xl">
        <img src="/pics/leonardo-miranda-riHGdvluDk8-unsplash.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="absolute bottom-7 right-4 rounded-full bg-[#eee7dc] px-5 py-3 text-sm font-bold text-[#171411] shadow-xl">
        One QR. Every point of view.
      </div>
    </div>
  );
}
