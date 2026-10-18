import { createAuthClient } from "@neondatabase/auth"
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters"

export const authClient = createAuthClient(
  `${window.location.origin}/api/auth`,
  {
    adapter: BetterAuthReactAdapter({
      fetchOptions: {
        credentials: "include",
        // SDK memory caching ignores disableCookieCache, including hook refetches.
        headers: { "X-Force-Fetch": "true" },
      },
    }),
  }
)
