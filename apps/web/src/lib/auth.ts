export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; userId: string; sessionId: string }
  | { status: "unavailable"; message: string }

export const authUnavailableMessage =
  "Authentication is unavailable. Check the server's Neon Auth configuration and connection, then retry."

export function authIdentity(auth: AuthState) {
  return auth.status === "authenticated"
    ? JSON.stringify([auth.userId, auth.sessionId])
    : auth.status
}

export function safeReturnTo(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  ) {
    return "/todos"
  }
  const url = new URL(value, "https://mercury.invalid")
  if (
    url.origin !== "https://mercury.invalid" ||
    ["/sign-in", "/sign-up", "/reset-password"].includes(url.pathname)
  ) {
    return "/todos"
  }
  return `${url.pathname}${url.search}${url.hash}`
}
