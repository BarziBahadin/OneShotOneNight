import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasAdminToken } from "@/lib/api";

export function AdminGuard() {
  const location = useLocation();

  if (!hasAdminToken()) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
