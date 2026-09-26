// Verification scaffolding: reuses apps/web/vite.config.ts but points the /api
// proxy at this run's API port instead of the hardcoded localhost:3000.
// .mts keeps it ESM; `vite` itself is not imported because it doesn't resolve from here.
import path from "node:path"
import base from "../../../../apps/web/vite.config"

const apiPort = process.env.VERIFY_API_PORT
if (!apiPort) throw new Error("VERIFY_API_PORT is not set")

export default {
  ...base,
  root: path.resolve(import.meta.dirname, "../../../../apps/web"),
  server: {
    ...base.server,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
}
