import { Link } from "react-router-dom";
import { ArrowRight, Camera, Images, QrCode, ShieldCheck } from "lucide-react";

const promises = [
  ["No app to install", "Guests scan and start shooting"],
  ["Private by design", "Only people with your link get in"],
  ["Your reveal, your time", "Keep the gallery hidden until you’re ready"]
];

const features = [
  [Camera, "Every perspective", "The dance floor, the quiet table, the blurry midnight selfie—collect the moments one photographer could never see alone."],
  [ShieldCheck, "Private by design", "Your event stays behind one private link. You decide when uploads close, what appears, and who can return to the gallery."],
  [Images, "A reveal worth waiting for", "Keep every photo hidden during the event, then open one beautiful shared gallery when the night is ready to be relived."]
];

const steps = [
  ["Set the frame", "Create your event, choose the upload window, and decide when the gallery should open."],
  ["Pass it around", "Place the QR code on a table or invitation. Guests scan it—no download and no account."],
  ["Relive the night", "When the time comes, Nightframe turns everyone’s photos into one private gallery."]
];

export default function HomePage() {
  return (
    <main className="app-frame flex flex-col gap-10">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b hairline pb-5">
        <Link to="/" className="flex items-center gap-3 font-bold tracking-tight">
          <img
            src="/brand/nightframe-mark-gold.svg"
            alt=""
            width={80}
            height={80}
            className="h-10 w-10 object-contain"
            decoding="async"
            aria-hidden="true"
          />
          <span>Nightframe</span>
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost text-sm" to="/admin">Host sign in</Link>
          <Link className="btn-primary text-sm" to="/admin/events/new">Create a Nightframe</Link>
        </div>
      </nav>

      <section className="grid min-h-[78vh] gap-10 py-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:py-14">
        <div className="relative z-10">
          <p className="eyebrow mb-4">One night. Every perspective.</p>
          <h1 className="editorial-title max-w-3xl">The night, as everyone saw it.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-moss">
            Give every guest the same private camera with one QR code. Collect the candid moments, keep them hidden, and reveal the whole story when you’re ready.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="btn-primary px-5 py-3" to="/admin/events/new">
              Create your Nightframe <ArrowRight className="h-4 w-4" />
            </Link>
            <a className="btn-dark px-5 py-3" href="#how-it-works">See how it works</a>
          </div>
          <div className="mt-10 grid max-w-2xl border-y hairline sm:grid-cols-3">
            {promises.map(([value, label]) => (
              <div key={value} className="border-b hairline px-3 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:px-5 sm:last:border-r-0">
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
          <ResponsivePhoto
            name="jonathan-borba-eg-72fI9wK4-unsplash"
            width={2400}
            height={1600}
            alt="Newlyweds celebrating as their guests throw confetti"
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
          <figcaption className="absolute inset-x-0 bottom-0 p-7 sm:p-9">
            <p className="eyebrow">No shot list. No posing.</p>
            <h2 className="mt-3 max-w-xl text-4xl font-semibold text-white sm:text-5xl">The moments between the moments.</h2>
          </figcaption>
        </figure>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <figure className="relative min-h-64 overflow-hidden rounded-[2rem]">
            <ResponsivePhoto
              name="golden-event"
              width={687}
              height={1030}
              alt="Elegant outdoor event table glowing in golden-hour sunlight"
              sizes="(min-width: 1024px) 34vw, (min-width: 640px) 50vw, 100vw"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
            <figcaption className="absolute bottom-0 p-6 text-xl font-semibold text-white">The calm before everyone arrives.</figcaption>
          </figure>
          <figure className="relative min-h-64 overflow-hidden rounded-[2rem]">
            <ResponsivePhoto
              name="andre-hunter-YK46WkDJj8s-unsplash"
              width={2400}
              height={1601}
              alt="Friends celebrating together under colorful party lights"
              sizes="(min-width: 1024px) 34vw, (min-width: 640px) 50vw, 100vw"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
            <figcaption className="absolute bottom-0 p-6 text-xl font-semibold text-white">The story only your guests could tell.</figcaption>
          </figure>
        </div>
      </section>

      <section id="features" className="grid gap-4 lg:grid-cols-3">
        {features.map(([Icon, title, copy]) => (
          <article key={String(title)} className="surface p-5">
            <Icon className="h-7 w-7 text-coral" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">{title as string}</h2>
            <p className="mt-2 leading-7 text-moss">{copy as string}</p>
          </article>
        ))}
      </section>

      <section id="how-it-works" className="grid scroll-mt-8 gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="text-3xl font-black leading-tight sm:text-5xl">Three steps. No guest accounts. Nothing to explain.</h2>
          <p className="mt-4 max-w-xl leading-7 text-ink/70">
            Nightframe stays out of the way during the event and brings everyone back together afterward.
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

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f1b2d] p-7 shadow-[0_32px_100px_rgba(0,0,0,0.32)] sm:p-10 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-8">
        <img src="/brand/nightframe_logo_white.svg" alt="" className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 object-contain opacity-[0.06]" aria-hidden="true" />
        <div>
          <p className="eyebrow mb-3">Your night deserves every angle</p>
          <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl">Make a gallery nobody else could have photographed.</h2>
          <p className="mt-3 max-w-2xl leading-7 text-white/65">
            Create the event now, share the QR when you’re ready, and let Nightframe hold every perspective until the reveal.
          </p>
        </div>
        <Link className="btn-primary relative mt-6 px-5 py-3 lg:mt-0" to="/admin/events/new">
          Create your Nightframe <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}

function HeroPhotos() {
  return (
    <div className="relative mx-auto h-[580px] w-full max-w-[680px]" aria-hidden="true">
      <div className="absolute inset-y-4 left-[8%] right-[18%] overflow-hidden rounded-[2rem] shadow-[0_35px_100px_rgba(0,0,0,0.45)]">
        <ResponsivePhoto name="golden-event" width={687} height={1030} alt="" sizes="(min-width: 1024px) 48vw, 88vw" loading="eager" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-amber/5" />
      </div>
      <div className="absolute right-0 top-14 h-[250px] w-[38%] rotate-3 overflow-hidden rounded-[1.5rem] border-4 border-[#eee7dc] shadow-2xl">
        <ResponsivePhoto name="sujan-khalifa-LO1lToLGGFA-unsplash" width={2400} height={3601} alt="" sizes="28vw" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="absolute bottom-0 left-0 h-[245px] w-[40%] -rotate-3 overflow-hidden rounded-[1.5rem] border-4 border-[#eee7dc] shadow-2xl">
        <ResponsivePhoto name="leonardo-miranda-riHGdvluDk8-unsplash" width={2400} height={1600} alt="" sizes="28vw" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="absolute bottom-7 right-4 rounded-full bg-[#eee7dc] px-5 py-3 text-sm font-bold text-[#171411] shadow-xl">
        One QR. Every point of view.
      </div>
    </div>
  );
}

function ResponsivePhoto({
  name,
  width,
  height,
  alt,
  sizes,
  className,
  loading = "lazy",
  fetchPriority
}: {
  name: string;
  width: number;
  height: number;
  alt: string;
  sizes: string;
  className?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
}) {
  const webp = [640, 960, 1280]
    .filter((size) => size <= width)
    .map((size) => `/pics/${name}-${size}.webp ${size}w`)
    .join(", ");

  return (
    <picture>
      <source type="image/webp" srcSet={webp} sizes={sizes} />
      <img
        src={`/pics/${name}.jpg`}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        className={className}
      />
    </picture>
  );
}
