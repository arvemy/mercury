import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { authClient } from "./auth-client"
import { AuthContext } from "./auth-context"
import { authUnavailableMessage, type AuthState } from "./auth"
import { sessionAuth } from "./auth-session"
import { clearPrivateCache, SessionExpiredError } from "./queries"

export function AuthProvider({
  children,
  queryClient,
}: {
  children: ReactNode
  queryClient: QueryClient
}) {
  const session = authClient.useSession()
  const refetch = session.refetch
  const [override, setOverride] = useState<AuthState | null>(null)
  const observed = sessionAuth(session)
  const [lastSettledStatus, setLastSettledStatus] =
    useState<AuthState["status"]>("loading")
  if (observed.status !== "loading" && observed.status !== lastSettledStatus)
    setLastSettledStatus(observed.status)
  const auth: AuthState =
    override ??
    (observed.status === "loading" && lastSettledStatus === "anonymous"
      ? { status: "anonymous" }
      : observed)
  const operation = useRef<{
    kind: "refresh" | "sign-out"
  } | null>(null)
  const refresh = useCallback(async (): Promise<AuthState> => {
    if (operation.current?.kind === "sign-out") return { status: "loading" }
    const currentOperation = {
      kind: "refresh",
    } satisfies NonNullable<typeof operation.current>
    operation.current = currentOperation
    try {
      const result = await authClient.getSession({
        query: { disableCookieCache: true },
      })
      const next = sessionAuth({ ...result, isPending: false })
      await refetch({ query: { disableCookieCache: true } })
      if (operation.current !== currentOperation) return { status: "loading" }
      setOverride(next.status === "unavailable" ? next : null)
      return next
    } catch {
      const next: AuthState = {
        status: "unavailable",
        message: authUnavailableMessage,
      }
      if (operation.current === currentOperation) setOverride(next)
      return next
    } finally {
      if (operation.current === currentOperation) operation.current = null
    }
  }, [refetch])

  const signOut = useCallback(async () => {
    if (operation.current?.kind === "sign-out") return
    const currentOperation = {
      kind: "sign-out",
    } satisfies NonNullable<typeof operation.current>
    operation.current = currentOperation
    setOverride({ status: "loading" })
    await clearPrivateCache(queryClient)
    try {
      const result = await authClient.signOut()
      if (result.error) throw new Error("Sign out failed")
      const current = await authClient.getSession({
        query: { disableCookieCache: true },
      })
      if (current.error || current.data) throw new Error("Session still active")
      await refetch({ query: { disableCookieCache: true } })
      setOverride(null)
    } catch {
      setOverride({
        status: "unavailable",
        message:
          "We couldn't confirm sign out. Your private data is hidden. Retry signing out.",
      })
    } finally {
      if (operation.current === currentOperation) operation.current = null
    }
  }, [queryClient, refetch])

  useEffect(() => {
    const recover = (error: unknown) => {
      if (error instanceof SessionExpiredError) {
        setOverride({ status: "loading" })
        void refresh()
      }
    }
    const unsubscribeQuery = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error")
        recover(event.query.state.error)
    })
    const unsubscribeMutation = queryClient
      .getMutationCache()
      .subscribe((event) => {
        if (event.type === "updated" && event.action.type === "error")
          recover(event.mutation.state.error)
      })
    return () => {
      unsubscribeQuery()
      unsubscribeMutation()
    }
  }, [queryClient, refresh])

  return (
    <AuthContext value={{ auth, refresh, signOut }}>{children}</AuthContext>
  )
}
