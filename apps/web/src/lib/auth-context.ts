import { createContext, useContext } from "react"
import type { AuthState } from "./auth"

export type AuthControls = {
  auth: AuthState
  refresh: () => Promise<AuthState>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthControls | null>(null)

export function useAppAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("Missing auth provider")
  return value
}
