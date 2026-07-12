import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiURL = new URL(process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || "https://huakafctiajezinrzfle.supabase.co/functions/v1/api");
  const apiOrigin = apiURL.origin;
  const apiPath = apiURL.pathname.replace(/\/$/, "");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL(".", import.meta.url))
      },
    },
    server: {
      host: true,
      port: 3000,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiOrigin,
          changeOrigin: true,
          rewrite: (path) => `${apiPath}${path}`
        }
      }
    },
    preview: {
      host: true,
      port: 3000,
      strictPort: true
    }
  };
});
