import {
  NEON_AUTH_SESSION_COOKIE_NAME,
  NEON_AUTH_SESSION_DATA_COOKIE_NAME,
  parseCookieValue,
  serializeSetCookie,
} from "@neondatabase/auth/server"
import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test"
import { app } from "./app.js"
import {
  appOrigin,
  sessionCookie,
  sessionHeaders,
  startAuthProvider,
  testBindings,
  upstreamSession,
} from "./test/auth.js"

const provider = await startAuthProvider()
const bindings = testBindings(undefined, provider.baseUrl)
beforeEach(() => provider.reset())
afterAll(() => provider.close())

describe("todo authentication through the managed Auth SDK", () => {
  it.each(["/api/todos", "/api/todos/unknown"])(
    "rejects anonymous %s without bindings or database access",
    async (path) => {
      const res = await app.request(path)
      expect(res.status).toBe(401)
      expect(res.headers.get("Cache-Control")).toBe("private, no-store")
    }
  )

  it.each([
    new Headers({ Authorization: "Bearer token_user_alice" }),
    new Headers({ Cookie: "unrelated=token_user_alice" }),
    new Headers({ Cookie: `${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=cached` }),
    new Headers({ Cookie: `${NEON_AUTH_SESSION_COOKIE_NAME}=` }),
    new Headers({
      Cookie: `${NEON_AUTH_SESSION_COOKIE_NAME}_other=token_user_alice`,
    }),
  ])("requires the exact nonempty session cookie: %j", async (headers) => {
    const res = await app.request("/api/todos", { headers })
    expect(res.status).toBe(401)
    expect(provider.requests).toHaveLength(0)
  })

  it.each([
    undefined,
    { ...bindings, APP_ORIGIN: "https://app.example/path" },
    { ...bindings, NEON_AUTH_BASE_URL: "invalid" },
    { ...bindings, NEON_AUTH_BASE_URL: "ftp://example.com/auth" },
    { ...bindings, NEON_AUTH_BASE_URL: "https://user:pass@example.com/auth" },
    { ...bindings, NEON_AUTH_COOKIE_SECRET: "short" },
  ])(
    "fails closed with supplied credentials and invalid config %#",
    async (env) => {
      const res = await app.request(
        "/api/todos",
        { headers: sessionHeaders() },
        env
      )
      expect(res.status).toBe(503)
      expect(provider.requests).toHaveLength(0)
    }
  )

  it.each([undefined, "null", "https://other.example", `${appOrigin}/`])(
    "rejects unsafe origin %s before provider or database work",
    async (origin) => {
      const headers = new Headers(sessionHeaders())
      headers.delete("Origin")
      if (origin) headers.set("Origin", origin)
      const res = await app.request(
        "/api/todos",
        {
          method: "POST",
          headers,
          body: "not JSON",
        },
        bindings
      )
      expect(res.status).toBe(403)
      expect(provider.requests).toHaveLength(0)
    }
  )

  it.each([null, upstreamSession({ expiresInSeconds: -60 })])(
    "rejects a revoked or expired upstream session",
    async (data) => {
      provider.respond(() => Response.json(data))
      const res = await app.request(
        "/api/todos",
        { headers: sessionHeaders() },
        bindings
      )
      expect(res.status).toBe(401)
      expect(provider.requests).toHaveLength(1)
    }
  )

  it.each([
    {},
    { ...upstreamSession(), user: { id: "" } },
    { ...upstreamSession(), user: { id: 42 } },
    {
      ...upstreamSession(),
      session: { ...upstreamSession().session, userId: "user_bob" },
    },
    {
      ...upstreamSession(),
      session: { ...upstreamSession().session, expiresAt: "invalid" },
    },
  ])("rejects malformed non-null session fields with 503: %#", async (data) => {
    provider.respond(() => Response.json(data))
    const res = await app.request(
      "/api/todos",
      { headers: sessionHeaders() },
      bindings
    )
    expect(res.status).toBe(503)
  })

  it("fails closed with 401 when the SDK collapses malformed JSON into a null session", async () => {
    provider.respond(() => new Response("not JSON"))
    const res = await app.request(
      "/api/todos",
      { headers: sessionHeaders() },
      bindings
    )
    expect(res.status).toBe(401)
  })

  it.each([401, 403, 429, 500, 503])(
    "handles upstream HTTP %s without database access",
    async (status) => {
      provider.respond(() =>
        Response.json({ message: "provider failure" }, { status })
      )
      const res = await app.request(
        "/api/todos",
        { headers: sessionHeaders() },
        bindings
      )
      expect(res.status).toBe(status === 401 ? 401 : 503)
    }
  )

  it("returns 503 when the configured provider is unreachable", async () => {
    const res = await app.request(
      "/api/todos",
      { headers: sessionHeaders() },
      testBindings()
    )
    expect(res.status).toBe(503)
  })

  it.each([{ title: "" }, { title: "   " }])(
    "verifies a same-origin session before title validation",
    async (json) => {
      const res = await app.request(
        "/api/todos",
        {
          method: "POST",
          headers: sessionHeaders(),
          body: JSON.stringify(json),
        },
        bindings
      )
      expect(res.status).toBe(400)
      expect(provider.requests).toHaveLength(1)
    }
  )

  it("sends only the canonical cookie with escaped values and disables the upstream cache", async () => {
    provider.respond(() => Response.json(null))
    const cookie = sessionCookie("token; unrelated=injected%value")
    const res = await app.request(
      "/api/todos",
      {
        headers: {
          Cookie: `unrelated=private; ${cookie}; ${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=cached`,
        },
      },
      bindings
    )
    expect(res.status).toBe(401)
    const [request] = provider.requests
    expect(request?.url).toBe(
      `${provider.baseUrl}/get-session?disableCookieCache=true`
    )
    expect(request?.headers.get("Cookie")).toBe(cookie)
    expect(request?.headers.get("Origin")).toBe("http://localhost")
  })

  it("appends every SDK session-refresh cookie to protected responses", async () => {
    provider.respond(() => {
      const headers = new Headers()
      headers.append(
        "Set-Cookie",
        `${sessionCookie()}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`
      )
      headers.append(
        "Set-Cookie",
        "__Secure-neon-auth.session_challenge=rotated; Path=/; HttpOnly; Secure; SameSite=None; Partitioned"
      )
      return Response.json(upstreamSession(), { headers })
    })
    const res = await app.request(
      "/api/todos",
      {
        method: "POST",
        headers: sessionHeaders(),
        body: JSON.stringify({ title: "" }),
      },
      bindings
    )
    expect(res.status).toBe(400)
    const cookies = res.headers.getSetCookie()
    for (const name of [
      NEON_AUTH_SESSION_COOKIE_NAME,
      "__Secure-neon-auth.session_challenge",
    ]) {
      const cookie = cookies.find((entry) => entry.startsWith(`${name}=`))
      expect(cookie).toContain("HttpOnly")
      expect(cookie).toContain("Secure")
      expect(cookie).toContain("SameSite=Lax")
      expect(cookie).not.toContain("Partitioned")
    }
  })

  it("preserves database failures as 500 after a valid session", async () => {
    const res = await app.request(
      "/api/todos",
      { headers: sessionHeaders() },
      bindings
    )
    expect(res.status).toBe(500)
  })
})

describe("same-origin managed Auth proxy", () => {
  it.each([undefined, "null", "https://other.example"])(
    "rejects anonymous unsafe origin %s before provider work",
    async (origin) => {
      const headers = new Headers({ "Content-Type": "application/json" })
      if (origin) headers.set("Origin", origin)
      const res = await app.request(
        "/api/auth/sign-in/email",
        {
          method: "POST",
          headers,
          body: "{}",
        },
        bindings
      )
      expect(res.status).toBe(403)
      expect(provider.requests).toHaveLength(0)
      expect(res.headers.get("Cache-Control")).toBe("private, no-store")
    }
  )

  it("preserves official proxy failure responses without opening the database", async () => {
    provider.respond(() =>
      Response.json({ code: "PROVIDER_UNAVAILABLE" }, { status: 503 })
    )
    const res = await app.request("/api/auth/get-session", {}, bindings)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ code: "PROVIDER_UNAVAILABLE" })
    expect(res.headers.get("Cache-Control")).toBe("private, no-store")
  })

  it("requires valid proxy configuration even for anonymous sign-in", async () => {
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { Origin: appOrigin },
    })
    expect(res.status).toBe(503)
  })

  it.each(["OPTIONS", "HEAD"])(
    "rejects unsupported %s without proxying",
    async (method) => {
      const res = await app.request(
        "/api/auth/get-session",
        { method },
        bindings
      )
      expect(res.status).toBe(405)
      expect(provider.requests).toHaveLength(0)
    }
  )

  it.each([
    "/api/auth//evil.example/path",
    "/api/auth/%2f%2fevil.example",
    "/api/auth/%2e%2e%2fescape",
  ])(
    "rejects a path that could escape the configured auth base: %s",
    async (path) => {
      const res = await app.request(path, {}, bindings)
      expect(res.status).toBe(400)
      expect(provider.requests).toHaveLength(0)
    }
  )

  it("forwards the configured path, query and body while filtering unrelated cookies", async () => {
    provider.respond(() => Response.json({ ok: true }))
    const res = await app.request(
      "/api/auth/sign-in/email?next=https://other.example",
      {
        method: "POST",
        headers: {
          ...sessionHeaders(),
          Cookie: `${sessionCookie()}; unrelated=private`,
        },
        body: JSON.stringify({
          email: "alice@example.com",
          password: "fixture-password",
        }),
      },
      bindings
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("private, no-store")
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull()
    const [request] = provider.requests
    expect(request?.url).toBe(
      `${provider.baseUrl}/sign-in/email?next=https://other.example`
    )
    expect(request?.headers.get("Cookie")).toBe(sessionCookie())
    expect(request?.headers.get("Origin")).toBe(appOrigin)
    expect(await request?.json()).toEqual({
      email: "alice@example.com",
      password: "fixture-password",
    })
  })

  it("preserves multiple cookies and sign-out deletion flags", async () => {
    provider.respond(() => {
      const headers = new Headers()
      headers.append(
        "Set-Cookie",
        `${NEON_AUTH_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
      )
      headers.append(
        "Set-Cookie",
        "__Secure-neon-auth.session_challenge=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned"
      )
      return Response.json({ success: true }, { headers })
    })
    const res = await app.request(
      "/api/auth/sign-out",
      {
        method: "POST",
        headers: sessionHeaders(),
        body: "{}",
      },
      bindings
    )
    expect(res.status).toBe(200)
    const cookies = res.headers.getSetCookie()
    expect(cookies.length).toBeGreaterThanOrEqual(2)
    for (const name of [
      NEON_AUTH_SESSION_COOKIE_NAME,
      "__Secure-neon-auth.session_challenge",
    ]) {
      const cookie = cookies.find((entry) => entry.startsWith(`${name}=`))
      expect(cookie).toContain("Max-Age=0")
      expect(cookie).toContain("HttpOnly")
      expect(cookie).toContain("Secure")
      expect(cookie).toContain("SameSite=Lax")
      expect(cookie).not.toContain("Partitioned")
    }
  })

  it("rejects a revoked session despite a valid SDK-minted browser cache", async () => {
    provider.respond((request) =>
      new URL(request.url).pathname.endsWith("sign-in/email")
        ? Response.json(upstreamSession(), {
            headers: {
              "Set-Cookie": `${sessionCookie()}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`,
            },
          })
        : Response.json(upstreamSession())
    )
    const signedIn = await app.request(
      "/api/auth/sign-in/email",
      {
        method: "POST",
        headers: sessionHeaders(),
        body: "{}",
      },
      bindings
    )
    expect(signedIn.status).toBe(200)
    const cacheHeader = signedIn.headers
      .getSetCookie()
      .find((cookie) =>
        cookie.startsWith(`${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=`)
      )
    expect(cacheHeader).toBeDefined()
    const cache = parseCookieValue(
      cacheHeader ?? "",
      NEON_AUTH_SESSION_DATA_COOKIE_NAME
    )
    expect(cache).toBeTruthy()
    const cookie = `${sessionCookie()}; ${serializeSetCookie({ name: NEON_AUTH_SESSION_DATA_COOKIE_NAME, value: cache ?? "" })}`
    provider.reset()
    provider.respond(() => Response.json(null))
    const cached = await app.request(
      "/api/auth/get-session",
      { headers: { Cookie: cookie } },
      bindings
    )
    expect(cached.status).toBe(200)
    expect(await cached.json()).toMatchObject({ user: { id: "user_alice" } })
    expect(provider.requests).toHaveLength(0)
    const privateResponse = await app.request(
      "/api/todos",
      { headers: { Cookie: cookie } },
      bindings
    )
    expect(privateResponse.status).toBe(401)
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]?.headers.get("Cookie")).toBe(sessionCookie())
  })
})
