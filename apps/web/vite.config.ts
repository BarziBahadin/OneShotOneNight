import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { networkInterfaces } from "node:os";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const apiRoot = fileURLToPath(new URL("../api", import.meta.url));

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, projectRoot, "");
  const publicWebURL = usablePublicURL(rootEnv.PUBLIC_WEB_URL) ?? `http://${lanAddress()}:3000`;

  return {
    plugins: [react(), localBackend({ ...rootEnv, PUBLIC_WEB_URL: publicWebURL })],
    define: {
      "import.meta.env.VITE_PUBLIC_WEB_URL": JSON.stringify(publicWebURL)
    },
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
          target: "http://localhost:8080",
          changeOrigin: true
        },
        "/healthz": {
          target: "http://localhost:8080",
          changeOrigin: true
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

function localBackend(rootEnv: Record<string, string>): Plugin {
  let api: ChildProcess | undefined;

  return {
    name: "oneshot-local-backend",
    apply: "serve",
    async configureServer(server) {
      if (await apiIsHealthy()) return;

      spawnSync("docker", ["compose", "-f", `${projectRoot}/deployments/docker-compose.yml`, "up", "-d"], {
        cwd: projectRoot,
        stdio: "inherit"
      });

      api = spawn("go", ["run", "./cmd/api"], {
        cwd: apiRoot,
        env: { ...process.env, ...rootEnv },
        stdio: "inherit"
      });

      server.httpServer?.once("close", () => {
        api?.kill("SIGTERM");
      });
    }
  };
}

async function apiIsHealthy() {
  try {
    const response = await fetch("http://localhost:8080/healthz", {
      signal: AbortSignal.timeout(750)
    });
    return response.ok;
  } catch {
    return false;
  }
}

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
