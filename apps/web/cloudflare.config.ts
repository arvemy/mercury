import { fileURLToPath } from "node:url"
import { bindings, defineConfig } from "cf/config"
import { loadEnv } from "vite"

const projectName = "mercury"
const projectDirectory = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = fileURLToPath(new URL("../..", import.meta.url))

export default defineConfig(({ mode = "production" }) => {
  if (!["development", "production", "staging", "test"].includes(mode)) {
    throw new Error(`Unsupported Cloudflare mode: ${mode}`)
  }
  const env = {
    ...loadEnv(mode, projectRoot, ""),
    ...Object.fromEntries(
      Object.entries(loadEnv(mode, projectDirectory, "")).filter(
        ([, value]) => value.trim() !== ""
      )
    ),
    ...process.env,
  }
  const appOrigin = env.APP_ORIGIN || "http://localhost:5173"
  const domain = env.CLOUDFLARE_CUSTOM_DOMAIN
  return {
    worker: {
      name: `${projectName}-${mode}`,
      entrypoint: "../api/src/index.ts",
      compatibilityDate: "2026-10-16",
      compatibilityFlags: ["nodejs_compat"],
      env: {
        HYPERDRIVE: bindings.hyperdrive({
          id: env.HYPERDRIVE_ID || "00000000000000000000000000000000",
          dev: {
            connectionString: "postgres://mercury:mercury@127.0.0.1:1/mercury",
          },
        }),
        NEON_AUTH_BASE_URL: bindings.text(env.NEON_AUTH_BASE_URL || ""),
        NEON_AUTH_COOKIE_SECRET: bindings.secret(),
        APP_ORIGIN: bindings.text(appOrigin),
      },
      assets: {
        htmlHandling: "none",
        notFoundHandling: "none",
        runWorkerFirst: ["/api", "/api/*"],
      },
      domains: domain ? [domain] : [],
      workersDev: !domain,
      observability: {
        enabled: true,
        redactQueryString: true,
        logs: { enabled: true, invocationLogs: true },
        traces: { enabled: true, headSamplingRate: 0.1 },
      },
    },
  }
})
