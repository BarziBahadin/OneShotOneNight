import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import HomePage from "@/app/page";

const AdminDashboard = lazy(() => import("@/components/admin-dashboard").then((module) => ({ default: module.AdminDashboard })));
const AdminEventCreator = lazy(() => import("@/components/admin-event-creator").then((module) => ({ default: module.AdminEventCreator })));
const AdminEventDetailView = lazy(() => import("@/components/admin-event-detail").then((module) => ({ default: module.AdminEventDetailView })));
const AdminEvents = lazy(() => import("@/components/admin-events").then((module) => ({ default: module.AdminEvents })));
const AdminGuard = lazy(() => import("@/components/admin-guard").then((module) => ({ default: module.AdminGuard })));
const AdminLogin = lazy(() => import("@/components/admin-login").then((module) => ({ default: module.AdminLogin })));
const GalleryView = lazy(() => import("@/components/gallery-view").then((module) => ({ default: module.GalleryView })));

export function AppRoutes() {
  return (
    <>
      <RouteDocumentMeta />
      <Suspense fallback={<main className="app-frame grid place-items-center text-moss">Loading...</main>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route element={<AdminGuard />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/events" element={<AdminEvents />} />
            <Route path="/admin/events/new" element={<AdminEventCreator />} />
            <Route path="/admin/events/:id" element={<AdminEventRoute />} />
          </Route>
          <Route path="/guest/:slug" element={<GuestRoute />} />
          <Route path="/guest-upload/:slug" element={<GuestUploadRoute />} />
          <Route path="/gallery/:slug" element={<GalleryRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

function RouteDocumentMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const privateRoute = pathname.startsWith("/admin") || pathname.startsWith("/guest") || pathname.startsWith("/gallery");
    const content = privateRoute ? "noindex, nofollow" : "index, follow";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = content;

    const canonicalURL = new URL(pathname, "https://one-shot-one-night.vercel.app").toString();
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalURL;
  }, [pathname]);
  return null;
}

function AdminEventRoute() {
  const { id = "" } = useParams();
  return <AdminEventDetailView eventID={id} />;
}

function GuestRoute() {
  const { slug = "" } = useParams();
  const [search] = useSearchParams();
  return <GalleryView slug={slug} accessToken={search.get("token") ?? search.get("t") ?? search.get("access_token") ?? ""} />;
}

function GuestUploadRoute() {
  const { slug = "" } = useParams();
  const [search] = useSearchParams();
  return <GalleryView slug={slug} accessToken={search.get("token") ?? search.get("t") ?? search.get("access_token") ?? ""} />;
}

function GalleryRoute() {
  const { slug = "" } = useParams();
  const [search] = useSearchParams();
  return <GalleryView slug={slug} accessToken={search.get("t") ?? search.get("token") ?? search.get("access_token") ?? ""} />;
}
