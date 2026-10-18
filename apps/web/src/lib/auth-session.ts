import type { authClient } from "./auth-client"
import { authUnavailableMessage, type AuthState } from "./auth"

type SessionResult = Pick<
  ReturnType<typeof authClient.useSession>,
  "data" | "isPending"
> & { error: unknown }

export function sessionAuth({
  data,
  error,
  isPending,
}: SessionResult): AuthState {
  if (error) return { status: "unavailable", message: authUnavailableMessage }
  const userId = data?.user?.id
  const sessionId = data?.session?.id
  if (
    typeof userId === "string" &&
    userId &&
    typeof sessionId === "string" &&
    sessionId &&
    data?.session?.userId === userId
  ) {
    return {
      status: "authenticated",
      userId,
      sessionId,
    }
  }
  if (data) return { status: "unavailable", message: authUnavailableMessage }
  return { status: isPending ? "loading" : "anonymous" }
}
