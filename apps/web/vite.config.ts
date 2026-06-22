import { execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, projectRoot, "");
  const publicWebURL = usablePublicURL(rootEnv.PUBLIC_WEB_URL) ?? `http://${lanAddress()}:3000`;

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_PUBLIC_WEB_URL": JSON.stringify(publicWebURL)
    },
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

function usablePublicURL(value?: string) {
  if (!value || value.includes("localhost") || value.includes("127.0.0.1")) return undefined;
  return value.replace(/\/$/, "");
}

function lanAddress() {
  try {
    return execFileSync("ipconfig", ["getifaddr", "en0"], { encoding: "utf8" }).trim();
  } catch {
    for (const addresses of Object.values(networkInterfaces())) {
      const address = addresses?.find((item) => item.family === "IPv4" && !item.internal);
      if (address) return address.address;
    }
    return "localhost";
  }
}
