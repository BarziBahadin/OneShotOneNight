import { Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import HomePage from "@/app/page";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminEventCreator } from "@/components/admin-event-creator";
import { AdminEventDetailView } from "@/components/admin-event-detail";
import { AdminEvents } from "@/components/admin-events";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLogin } from "@/components/admin-login";
import { EventCreator } from "@/components/event-creator";
import { GalleryView } from "@/components/gallery-view";
import { GuestCamera } from "@/components/guest-camera";

export function AppRoutes() {
  return (
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
      <Route path="/gallery/:slug" element={<GalleryRoute />} />
      <Route path="/host/events/new" element={<EventCreator />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AdminEventRoute() {
  const { id = "" } = useParams();
  return <AdminEventDetailView eventID={id} />;
}

function GuestRoute() {
  const { slug = "" } = useParams();
  const [search] = useSearchParams();
  return <GuestCamera slug={slug} accessToken={search.get("t") ?? ""} />;
}

function GalleryRoute() {
  const { slug = "" } = useParams();
  const [search] = useSearchParams();
  return <GalleryView slug={slug} accessToken={search.get("t") ?? ""} />;
}
