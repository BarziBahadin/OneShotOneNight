"use client";

import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { adminLogin } from "@/lib/api";

export function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await adminLogin(String(form.get("password") ?? ""));
      const destination = (location.state as { from?: string } | null)?.from ?? "/admin";
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-[100svh] w-full max-w-5xl content-center px-5 py-8">
      <div className="grid overflow-hidden rounded-[2rem] border hairline bg-white/[0.025] shadow-[0_40px_120px_rgba(0,0,0,0.35)] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden min-h-[620px] overflow-hidden bg-coral p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <img src="/app-icon-192.png" alt="" width={44} height={44} className="h-11 w-11 rounded-xl object-cover drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]" aria-hidden="true" />
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/65">Nightframe</p>
          </div>
          <div className="relative">
            <p className="max-w-sm font-['Playfair_Display'] text-6xl font-semibold leading-[0.95]">The night belongs to everyone.</p>
            <p className="mt-6 max-w-sm leading-7 text-white/70">One private camera. Every point of view. A gallery waiting at the end.</p>
          </div>
        </section>
        <form onSubmit={onSubmit} className="grid content-center gap-6 p-7 sm:p-12">
          <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border hairline bg-white/5">
            <LockKeyhole className="h-5 w-5 text-amber" aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Host studio</p>
            <h1 className="mt-1 text-3xl font-semibold">Welcome back.</h1>
          </div>
        </div>
        <Input label="Password" name="password" type="password" autoComplete="current-password" isRequired size="md" />
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <Button type="submit" size="md" isDisabled={busy} isLoading={busy} showTextWhileLoading>
          {busy ? "Signing in..." : "Sign in"}
        </Button>
        </form>
      </div>
    </main>
  );
}
