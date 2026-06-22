import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL(".", import.meta.url))
      },
    },
    server: { host: true, port: 3000, strictPort: true },
    preview: {
      host: true,
      port: 3000,
      strictPort: true
    }
  };
});
