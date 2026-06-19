import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "@/router";
import { ServiceWorker } from "@/components/service-worker";
import "@/app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ServiceWorker />
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>
);
