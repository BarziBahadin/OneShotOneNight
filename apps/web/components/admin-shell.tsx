"use client";

import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Plus } from "lucide-react";
import { adminLogout } from "@/lib/api";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    const redirectToLogin = () => navigate("/admin/login", { replace: true });
    window.addEventListener("admin-session-expired", redirectToLogin);
    return () => window.removeEventListener("admin-session-expired", redirectToLogin);
  }, [navigate]);

  async function logout() {
    await adminLogout().catch(() => undefined);
    navigate("/admin/login", { replace: true });
  }

  return (
    <main className="app-frame">
      <header className="mb-12 flex items-center justify-between gap-4 border-b hairline pb-5">
        <Link to="/admin" className="flex items-center gap-3">
          <img src="/app-icon-80.png" alt="" width={80} height={80} decoding="async" className="h-10 w-10 rounded-xl object-cover shadow-[0_0_18px_rgba(36,99,235,0.24)]" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold tracking-tight">OneShotOneNight</p>
            <p className="text-xs text-moss">Host studio</p>
          </div>
        </Link>
        <nav className="flex flex-wrap items-center gap-2">
          <Link className="btn-primary px-3 py-2 text-sm" to="/admin/events/new">
            <Plus className="h-4 w-4" /> New event
          </Link>
          <button onClick={logout} className="flex h-11 w-11 items-center justify-center rounded-full text-moss hover:bg-white/5 hover:text-ink" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </nav>
      </header>
      {children}
    </main>
  );
}
