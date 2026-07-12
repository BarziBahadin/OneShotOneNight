"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }
    if (!window.isSecureContext) {
      return;
    }
    // Service-worker startup and cache warming should never compete with the
    // initial render. Register once the page is loaded and the browser is idle.
    let idleID: number | undefined;
    let timeoutID: number | undefined;
    const requestIdle = (window as Window & {
      requestIdleCallback?: Window["requestIdleCallback"];
    }).requestIdleCallback;
    const register = () => {
      if (requestIdle) {
        idleID = requestIdle.call(
          window,
          () => navigator.serviceWorker.register("/sw.js").catch(() => undefined),
          { timeout: 10_000 }
        );
      } else {
        timeoutID = window.setTimeout(
          () => navigator.serviceWorker.register("/sw.js").catch(() => undefined),
          5_000
        );
      }
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      window.removeEventListener("load", register);
      if (idleID !== undefined) window.cancelIdleCallback(idleID);
      if (timeoutID !== undefined) window.clearTimeout(timeoutID);
    };
  }, []);
  return null;
}
