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
    plugins: [react(), appleAppSiteAssociation(rootEnv), localBackend({ ...rootEnv, PUBLIC_WEB_URL: publicWebURL })],
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

function appleAppSiteAssociation(rootEnv: Record<string, string>): Plugin {
  const body = JSON.stringify(appleAppSiteAssociationBody(rootEnv));
  const routes = new Set(["/.well-known/apple-app-site-association", "/apple-app-site-association"]);

  return {
    name: "oneshot-apple-app-site-association",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (!routes.has(pathname)) {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(body);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (!routes.has(pathname)) {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: ".well-known/apple-app-site-association",
        source: body
      });
      this.emitFile({
        type: "asset",
        fileName: "apple-app-site-association",
        source: body
      });
    }
  };
}

function appleAppSiteAssociationBody(rootEnv: Record<string, string>) {
  const teamID = rootEnv.APPLE_TEAM_ID ?? "";
  const appBundleID = rootEnv.IOS_APP_BUNDLE_ID ?? "";
  const clipBundleID = rootEnv.IOS_APP_CLIP_BUNDLE_ID ?? "";
  const pathPrefix = rootEnv.APP_CLIP_PATH_PREFIX || "/guest/*";
  const appIDs = teamID ? [appBundleID, clipBundleID].filter(Boolean).map((bundleID) => `${teamID}.${bundleID}`) : [];
  const appClips = teamID && clipBundleID ? [`${teamID}.${clipBundleID}`] : [];

  return {
    applinks: {
      details: [
        {
          appIDs,
          components: [
            {
              "/": pathPrefix,
              comment: "OneShotOneNight guest event links"
            }
          ]
        }
      ]
    },
    appclips: {
      apps: appClips
    }
  };
}

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
