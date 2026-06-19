import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { adminMe, isUnauthorizedError } from "@/lib/api";

export function AdminGuard() {
  const location = useLocation();
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthorized">("checking");

  useEffect(() => {
    let active = true;

    adminMe()
      .then((session) => {
        if (active) setStatus(session.authenticated ? "authenticated" : "unauthorized");
      })
      .catch((error) => {
        if (active) setStatus(isUnauthorizedError(error) ? "unauthorized" : "authenticated");
      });

    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") {
    return <main className="app-frame"><p className="surface px-4 py-3 text-moss">Checking your host session...</p></main>;
  }

  if (status === "unauthorized") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
