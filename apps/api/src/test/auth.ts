import { createServer } from "node:http"
import {
  NEON_AUTH_SESSION_COOKIE_NAME,
  parseCookieValue,
  serializeSetCookie,
} from "@neondatabase/auth/server"
import type { Bindings } from "../bindings.js"

export const appOrigin = "http://localhost:5173"

export function testBindings(
  connectionString = "postgresql://unused:unused@127.0.0.1:1/unused",
  authBaseUrl = "http://127.0.0.1:1/neondb/auth"
) {
  return {
    APP_ORIGIN: appOrigin,
    NEON_AUTH_BASE_URL: authBaseUrl,
    NEON_AUTH_COOKIE_SECRET: "local-test-cookie-secret-at-least-32-characters",
    HYPERDRIVE: { connectionString },
  } satisfies Bindings
}

export function upstreamSession({
  userId = "user_alice",
  expiresInSeconds = 60,
}: { userId?: string; expiresInSeconds?: number } = {}) {
  const now = new Date().toISOString()
  return {
    user: {
      id: userId,
      name: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: `session_${userId}`,
      token: `token_${userId}`,
      userId,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      createdAt: now,
      updatedAt: now,
    },
  }
}

export function sessionCookie(token = "token_user_alice") {
  return serializeSetCookie({
    name: NEON_AUTH_SESSION_COOKIE_NAME,
    value: token,
  })
}

export function sessionHeaders(userId = "user_alice") {
  return {
    Cookie: sessionCookie(`token_${userId}`),
    Origin: appOrigin,
    "Content-Type": "application/json",
  }
}

type ProviderHandler = (request: Request) => Response | Promise<Response>

export async function startAuthProvider() {
  const requests: Request[] = []
  const defaultHandler: ProviderHandler = (request) => {
    const token = parseCookieValue(
      request.headers.get("Cookie") ?? "",
      NEON_AUTH_SESSION_COOKIE_NAME
    )
    const userId = ["user_alice", "user_bob", "user_cookie"].find(
      (id) => token === `token_${id}`
    )
    return Response.json(userId ? upstreamSession({ userId }) : null)
  }
  let handler = defaultHandler
  const server = createServer(async (incoming, outgoing) => {
    const headers = new Headers()
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value))
        value.forEach((entry) => headers.append(name, entry))
      else if (value !== undefined) headers.set(name, value)
    }
    const chunks: Buffer[] = []
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks).toString()
    const request = new Request(
      `http://${incoming.headers.host}${incoming.url}`,
      {
        method: incoming.method,
        headers,
        ...(body ? { body } : {}),
      }
    )
    requests.push(request)
    const response = await handler(request)
    outgoing.writeHead(response.status, {
      ...Object.fromEntries(response.headers),
      "set-cookie": response.headers.getSetCookie(),
    })
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("No fixture port")
  return {
    baseUrl: `http://127.0.0.1:${address.port}/neondb/auth`,
    requests,
    respond: (next: ProviderHandler) => {
      handler = next
    },
    reset: () => {
      requests.length = 0
      handler = defaultHandler
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      }),
  }
}
