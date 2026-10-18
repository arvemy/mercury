import { useRef, useState } from "react"
import { isAuthApiError } from "@neondatabase/auth"
import { Link, useNavigate } from "@tanstack/react-router"
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

type Operation =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string }
type Verification =
  | { status: "credentials" }
  | { status: "verification"; email: string }
type AuthError = { message?: string; code?: string; status?: number }

function errorMessage(error: AuthError) {
  return error.status && error.status >= 500
    ? "Authentication is unavailable. Check the server's Neon Auth configuration and connection, then retry."
    : error.message || "We couldn't complete your request. Try again."
}

export function AuthForm({
  mode,
  redirect,
}: {
  mode: "sign-in" | "sign-up"
  redirect: string
}) {
  const { auth, refresh } = useAppAuth()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [verification, setVerification] = useState<Verification>({
    status: "credentials",
  })
  const [operation, setOperation] = useState<Operation>({ status: "idle" })
  const [notice, setNotice] = useState("")
  const busy = useRef(false)
  const pending = operation.status === "pending"
  const destination = safeReturnTo(redirect)

  async function run(action: () => Promise<void>) {
    if (busy.current) return
    busy.current = true
    setOperation({ status: "pending" })
    setNotice("")
    try {
      await action()
      setOperation({ status: "idle" })
    } catch (error) {
      setOperation({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "We couldn't complete your request. Try again.",
      })
    } finally {
      busy.current = false
    }
  }

  async function confirmSession() {
    const current = await refresh()
    if (current.status === "authenticated") {
      await navigate({ href: destination })
      return true
    }
    if (current.status === "unavailable") throw new Error(current.message)
    return false
  }

  async function sendCode(address: string) {
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: address,
      type: "email-verification",
    })
    if (result.error) throw new Error(errorMessage(result.error))
    setNotice("A verification code has been sent. Check your email.")
  }

  async function submitCredentials(
    address: string
  ): Promise<"submitted" | "verification-required"> {
    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              name: name.trim(),
              email: address,
              password,
              callbackURL: `${window.location.origin}${destination}`,
            })
          : await authClient.signIn.email({ email: address, password })
      if (result.error) {
        if (mode === "sign-in" && result.error.code === "EMAIL_NOT_VERIFIED")
          return "verification-required"
        throw new Error(errorMessage(result.error))
      }
      return "submitted"
    } catch (error) {
      if (
        mode === "sign-in" &&
        isAuthApiError(error) &&
        error.code === "email_not_confirmed"
      )
        return "verification-required"
      throw error
    }
  }

  if (auth.status === "unavailable") return <AuthUnavailable />
  if (auth.status === "loading")
    return <Text role="status">Loading your session…</Text>
  if (auth.status === "authenticated") {
    return (
      <Stack>
        <Text>You are signed in.</Text>
        <Button onClick={() => void navigate({ href: destination })}>
          Continue
        </Button>
      </Stack>
    )
  }

  return (
    <Stack>
      <Title order={1}>
        {verification.status === "verification"
          ? "Verify your email"
          : mode === "sign-up"
            ? "Create your account"
            : "Sign in to your account"}
      </Title>
      {verification.status === "verification" ? (
        <>
          <Text>Enter the verification code sent to {verification.email}.</Text>
          <Stack
            component="form"
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                const result = await authClient.emailOtp.verifyEmail({
                  email: verification.email,
                  otp: otp.trim(),
                })
                if (result.error) throw new Error(errorMessage(result.error))
                if (!(await confirmSession())) {
                  setVerification({ status: "credentials" })
                  setPassword("")
                  setOtp("")
                  await navigate({
                    to: "/sign-in",
                    search: { redirect: destination },
                  })
                }
              })
            }}
          >
            <TextInput
              label="Verification code"
              autoComplete="one-time-code"
              inputMode="numeric"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              required
              disabled={pending}
            />
            <Button type="submit" loading={pending} disabled={pending}>
              Verify email
            </Button>
          </Stack>
          <Button
            variant="default"
            disabled={pending}
            onClick={() => void run(() => sendCode(verification.email))}
          >
            Resend code
          </Button>
        </>
      ) : (
        <Stack
          component="form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              const address = email.trim()
              if (
                (await submitCredentials(address)) === "verification-required"
              ) {
                setVerification({ status: "verification", email: address })
                setPassword("")
                await sendCode(address)
                return
              }
              if (!(await confirmSession())) {
                if (mode === "sign-up") {
                  setVerification({ status: "verification", email: address })
                  setPassword("")
                } else
                  throw new Error(
                    "Sign in did not create a session. Please try again."
                  )
              }
            })
          }}
        >
          {mode === "sign-up" && (
            <TextInput
              label="Name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              disabled={pending}
            />
          )}
          <TextInput
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={pending}
          />
          <PasswordInput
            label="Password"
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            minLength={mode === "sign-up" ? 8 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={pending}
          />
          <Button type="submit" loading={pending} disabled={pending}>
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
        </Stack>
      )}
      {operation.status === "error" && (
        <Text c="red" role="alert">
          {operation.message}
        </Text>
      )}
      {notice && <Text role="status">{notice}</Text>}
      <Anchor
        renderRoot={(props) => (
          <Link
            {...props}
            to={mode === "sign-up" ? "/sign-in" : "/sign-up"}
            search={{ redirect: destination }}
          />
        )}
      >
        {mode === "sign-up"
          ? "Already have an account? Sign in"
          : "Create an account"}
      </Anchor>
      {mode === "sign-in" && (
        <Anchor
          renderRoot={(props) => (
            <Link
              {...props}
              to="/reset-password"
              search={{ redirect: destination }}
            />
          )}
        >
          Forgot your password?
        </Anchor>
      )}
    </Stack>
  )
}
