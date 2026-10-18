import { useEffect, useMemo, useState } from "react"
import { RouterProvider, type RouterHistory } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { Text } from "@mantine/core"
import { createAppRouter } from "./router"
import { authIdentity, type AuthState } from "./auth"
import { clearPrivateCache } from "./queries"
import { useAppAuth } from "./auth-context"

export function AuthRouter({
  history,
  queryClient,
  auth,
}: {
  history?: RouterHistory
  queryClient: QueryClient
  auth: AuthState
}) {
  const status = auth.status
  const userId = auth.status === "authenticated" ? auth.userId : ""
  const sessionId = auth.status === "authenticated" ? auth.sessionId : ""
  const message = auth.status === "unavailable" ? auth.message : ""
  const stableAuth = useMemo<AuthState>(() => {
    switch (status) {
      case "authenticated":
        return { status, userId, sessionId }
      case "unavailable":
        return { status, message }
      default:
        return { status }
    }
  }, [status, userId, sessionId, message])
  const identity = authIdentity(stableAuth)
  const router = useMemo(
    () => createAppRouter(queryClient, stableAuth, history),
    [stableAuth, queryClient, history]
  )
  const [cacheState, setCacheState] = useState({ identity, ready: false })
  useEffect(() => {
    let active = true
    async function synchronize() {
      await clearPrivateCache(queryClient)
      if (active && status !== "loading")
        setCacheState({ identity, ready: true })
    }
    void synchronize()
    return () => {
      active = false
    }
  }, [identity, queryClient, status])

  if (cacheState.identity !== identity) {
    setCacheState({ identity, ready: false })
  }
  if (
    status === "loading" ||
    cacheState.identity !== identity ||
    !cacheState.ready
  ) {
    return <Text role="status">Loading your session…</Text>
  }
  return <RouterProvider router={router} context={{ auth: stableAuth }} />
}

export function NeonAuthRouter({ queryClient }: { queryClient: QueryClient }) {
  const { auth } = useAppAuth()
  return <AuthRouter queryClient={queryClient} auth={auth} />
}
