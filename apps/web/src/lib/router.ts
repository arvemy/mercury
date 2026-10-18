import { createRouter, type RouterHistory } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import type { AuthState } from "./auth"
import { routeTree } from "../routeTree.gen"

export function createAppRouter(
  queryClient: QueryClient,
  auth: AuthState,
  history?: RouterHistory
) {
  return createRouter({
    routeTree,
    context: { queryClient, auth },
    history,
    defaultPreload: "intent",
    scrollRestoration: true,
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
