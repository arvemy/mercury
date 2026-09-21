import type { AppType } from "@workspace/api"
import { hc } from "hono/client"

export const api = hc<AppType>("/")
