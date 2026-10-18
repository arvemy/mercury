import {
  createAuthServer,
  handleAuthProxyRequest,
  NEON_AUTH_SESSION_COOKIE_NAME,
  parseCookieValue,
  serializeSetCookie,
  validateCookieConfig,
  type RequestContext,
} from "@neondatabase/auth/server"
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"
import { z } from "zod"
import type { Bindings } from "./bindings.js"

export type ApiEnv = {
  Bindings: Bindings
  Variables: { ownerId: string }
}

const httpUrl = z.url({ protocol: /^https?$/ })
const authConfigSchema = z.object({
  APP_ORIGIN: httpUrl.pipe(
    z.string().refine((value) => new URL(value).origin === value)
  ),
  NEON_AUTH_BASE_URL: httpUrl.pipe(
    z.string().refine((value) => {
      const url = new URL(value)
      return !url.username && !url.password && !url.search && !url.hash
    })
  ),
  NEON_AUTH_COOKIE_SECRET: z.string().min(32),
})
const sessionSchema = z
  .object({
    user: z.object({ id: z.string().min(1) }),
    session: z.object({
      userId: z.string().min(1),
      expiresAt: z.union([z.iso.datetime(), z.date()]).pipe(z.coerce.date()),
    }),
  })
  .refine(({ user, session }) => user.id === session.userId)
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"])
const proxyMethods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"])

export const requireUser = createMiddleware<ApiEnv>(async (c, next) => {
  c.header("Cache-Control", "private, no-store")
  const token = parseCookieValue(
    c.req.header("Cookie") ?? "",
    NEON_AUTH_SESSION_COOKIE_NAME
  )
  if (!token) return c.json({ error: "Unauthorized" }, 401)
  const config = authConfigSchema.safeParse(c.env)
  if (!config.success)
    return c.json({ error: "Authentication unavailable" }, 503)
  if (
    !safeMethods.has(c.req.method) &&
    c.req.header("Origin") !== config.data.APP_ORIGIN
  ) {
    return c.json({ error: "Forbidden origin" }, 403)
  }

  let ownerId: string
  try {
    const context: RequestContext = {
      // SDK 0.6.0-beta checks a string cache flag despite its boolean API; omit the cache cookie.
      getCookies: () =>
        serializeSetCookie({
          name: NEON_AUTH_SESSION_COOKIE_NAME,
          value: token,
        }),
      setCookie: (name, value, options) => {
        c.header(
          "Set-Cookie",
          serializeSetCookie({ ...options, name, value }),
          {
            append: true,
          }
        )
      },
      getHeader: (name) => c.req.header(name) ?? null,
      getOrigin: () => c.req.header("Origin") ?? new URL(c.req.url).origin,
      getFramework: () => "hono",
    }
    const auth = createAuthServer({
      baseUrl: config.data.NEON_AUTH_BASE_URL,
      cookieSecret: config.data.NEON_AUTH_COOKIE_SECRET,
      context: () => context,
      sameSite: "lax",
    })
    const { data, error } = await auth.getSession({
      query: { disableCookieCache: true },
    })
    if (error) {
      return error.status === 401
        ? c.json({ error: "Unauthorized" }, 401)
        : c.json({ error: "Authentication unavailable" }, 503)
    }
    if (data === null) return c.json({ error: "Unauthorized" }, 401)
    const parsed = sessionSchema.safeParse(data)
    if (!parsed.success)
      return c.json({ error: "Authentication unavailable" }, 503)
    if (parsed.data.session.expiresAt.getTime() <= Date.now())
      return c.json({ error: "Unauthorized" }, 401)
    ownerId = parsed.data.user.id
  } catch {
    return c.json({ error: "Authentication unavailable" }, 503)
  }
  c.set("ownerId", ownerId)
  await next()
})

export async function proxyAuth(c: Context<ApiEnv>) {
  c.header("Cache-Control", "private, no-store")
  if (!proxyMethods.has(c.req.method)) {
    c.header("Allow", [...proxyMethods].join(", "))
    return c.json({ error: "Method not allowed" }, 405)
  }
  const config = authConfigSchema.safeParse(c.env)
  if (!config.success)
    return c.json({ error: "Authentication unavailable" }, 503)
  if (
    !safeMethods.has(c.req.method) &&
    c.req.header("Origin") !== config.data.APP_ORIGIN
  ) {
    return c.json({ error: "Forbidden origin" }, 403)
  }
  const path = c.req.path.slice("/api/auth/".length)
  if (!path || path.split("/").some((part) => !/^[a-zA-Z0-9_-]+$/.test(part)))
    return c.json({ error: "Invalid authentication path" }, 400)
  try {
    validateCookieConfig({ secret: config.data.NEON_AUTH_COOKIE_SECRET })
    const response = await handleAuthProxyRequest({
      request: c.req.raw,
      path,
      baseUrl: config.data.NEON_AUTH_BASE_URL.replace(/\/$/, ""),
      cookieSecret: config.data.NEON_AUTH_COOKIE_SECRET,
      sameSite: "lax",
    })
    response.headers.set("Cache-Control", "private, no-store")
    return response
  } catch {
    return c.json({ error: "Authentication unavailable" }, 503)
  }
}
