import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vite-plus/test"
import { authClient } from "./auth-client"

afterEach(() => vi.unstubAllGlobals())

it("refreshes a revoked session through both the SDK client and React hook", async () => {
  const now = new Date().toISOString()
  const alice = {
    user: {
      id: "alice",
      name: "Alice",
      email: "alice@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "session-alice",
      userId: "alice",
      token: "fixture-token",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: now,
      updatedAt: now,
    },
  }
  let upstream: typeof alice | null = alice
  const requests: Request[] = []
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      expect(new URL(request.url).origin).toBe(window.location.origin)
      expect(new URL(request.url).pathname).toBe("/api/auth/get-session")
      expect(request.credentials).toBe("include")
      expect(request.headers.has("X-Force-Fetch")).toBe(false)
      return Response.json(upstream)
    }
  )

  expect((await authClient.getSession()).data?.user.id).toBe("alice")
  expect(requests).toHaveLength(1)
  const { result } = renderHook(() => authClient.useSession())
  await waitFor(() => {
    expect(result.current.isPending).toBe(false)
    expect(result.current.data?.user.id).toBe("alice")
  })

  upstream = null
  requests.length = 0
  const refreshed = await authClient.getSession({
    query: { disableCookieCache: true },
  })
  expect.soft(requests.length, "direct refresh must reach upstream").toBe(1)
  expect.soft(refreshed.data).toBeNull()
  expect.soft(refreshed.error).toBeNull()

  requests.length = 0
  await act(async () => {
    await result.current.refetch({ query: { disableCookieCache: true } })
  })
  expect(requests.length, "React refresh must reach upstream").toBe(1)
  for (const request of requests) {
    expect(new URL(request.url).searchParams.get("disableCookieCache")).toBe(
      "true"
    )
  }
  expect(result.current.data).toBeNull()
  expect(result.current.error).toBeNull()
  expect(result.current.isPending).toBe(false)
})
