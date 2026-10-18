import { useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  Anchor,
  Button,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core"
import { authClient } from "@/lib/auth-client"
import { safeReturnTo } from "@/lib/auth"
import { useAppAuth } from "@/lib/auth-context"
import { AuthUnavailable } from "./auth-status"

type ResetState =
  | { status: "email" }
  | { status: "code"; email: string }
  | { status: "complete" }

export function ResetPasswordForm({ redirect }: { redirect: string }) {
  const { auth } = useAppAuth()
  const [state, setState] = useState<ResetState>({ status: "email" })
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const busy = useRef(false)

  async function run(action: () => Promise<void>) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError("")
    setNotice("")
    try {
      await action()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Password reset failed. Try again."
      )
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  async function requestCode(address: string) {
    const result = await authClient.emailOtp.requestPasswordReset({
      email: address,
    })
    if (result.error)
      throw new Error(
        result.error.message || "Couldn't send a reset code. Try again."
      )
    setState({ status: "code", email: address })
    setNotice("If this email has an account, a reset code has been sent.")
  }

  if (auth.status === "unavailable") return <AuthUnavailable />
  return (
    <Stack>
      <Title order={1}>Reset your password</Title>
      {state.status === "complete" ? (
        <Text role="status">
          Your password has been reset. Sign in with your new password.
        </Text>
      ) : (
        <Stack
          component="form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              if (state.status === "email") await requestCode(email.trim())
              else {
                const result = await authClient.emailOtp.resetPassword({
                  email: state.email,
                  otp: otp.trim(),
                  password,
                })
                if (result.error)
                  throw new Error(
                    result.error.message ||
                      "Couldn't reset your password. Try again."
                  )
                setPassword("")
                setOtp("")
                setState({ status: "complete" })
              }
            })
          }}
        >
          {state.status === "email" ? (
            <TextInput
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={pending}
            />
          ) : (
            <>
              <Text>Enter the reset code sent to {state.email}.</Text>
              <TextInput
                label="Reset code"
                autoComplete="one-time-code"
                inputMode="numeric"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                required
                disabled={pending}
              />
              <PasswordInput
                label="New password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={pending}
              />
            </>
          )}
          <Button type="submit" loading={pending} disabled={pending}>
            {state.status === "email" ? "Send reset code" : "Reset password"}
          </Button>
        </Stack>
      )}
      {state.status === "code" && (
        <Button
          variant="default"
          disabled={pending}
          onClick={() => void run(() => requestCode(state.email))}
        >
          Resend reset code
        </Button>
      )}
      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}
      {notice && <Text role="status">{notice}</Text>}
      <Anchor
        renderRoot={(props) => (
          <Link
            {...props}
            to="/sign-in"
            search={{ redirect: safeReturnTo(redirect) }}
          />
        )}
      >
        Back to sign in
      </Anchor>
    </Stack>
  )
}
