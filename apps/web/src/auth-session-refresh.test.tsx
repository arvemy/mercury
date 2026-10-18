import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MantineProvider } from "@mantine/core"
import { createMemoryHistory } from "@tanstack/react-router"
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test"
import { authClient } from "./lib/auth-client"
import { AuthProvider } from "./lib/auth-provider"
import { useAppAuth } from "./lib/auth-context"
import { AuthRouter } from "./lib/auth-router"

let sessionGate: Promise<void> | undefined
let sessionFailure = false
let signInFailure = {
  status: 403,
  code: "EMAIL_NOT_VERIFIED",
  message: "Email not verified",
}
const requests: Request[] = []

function holdSession() {
  let release: (() => void) | undefined
  sessionGate = new Promise<void>((resolve) => {
    release = resolve
  })
  return () => release?.()
}

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const history = createMemoryHistory({ initialEntries: [path] })
  function App() {
    const { auth } = useAppAuth()
    return (
      <AuthRouter auth={auth} queryClient={queryClient} history={history} />
    )
  }
  render(
    <MantineProvider env="test">
      <QueryClientProvider client={queryClient}>
        <AuthProvider queryClient={queryClient}>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
  return renderHook(() => authClient.useSession())
}

beforeEach(() => {
  sessionGate = undefined
  sessionFailure = false
  signInFailure = {
    status: 403,
    code: "EMAIL_NOT_VERIFIED",
    message: "Email not verified",
  }
  requests.length = 0
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const path = new URL(request.url).pathname
      if (path === "/api/auth/get-session") {
        await sessionGate
        if (sessionFailure)
          return Response.json(
            { message: "Session service unavailable" },
            { status: 503 }
          )
        return Response.json(null)
      }
      if (path === "/api/auth/sign-up/email")
        return Response.json({ token: null, user: { id: "ada" } })
      if (path === "/api/auth/sign-in/email")
        return Response.json(
          { code: signInFailure.code, message: signInFailure.message },
          { status: signInFailure.status }
        )
      if (path === "/api/auth/email-otp/send-verification-otp")
        return Response.json({ success: true })
      if (path === "/api/auth/email-otp/request-password-reset") {
        await sessionGate
        return Response.json({ success: true })
      }
      throw new Error(`Unexpected request ${request.method} ${path}`)
    }
  )
})

afterEach(() => vi.unstubAllGlobals())

it("recovers the SDK's rejected unverified sign-in into email verification", async () => {
  renderApp("/sign-in")
  fireEvent.change(await screen.findByLabelText(/^Email/), {
    target: { value: "ada@example.test" },
  })
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: "long-password" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
  expect(
    await screen.findByRole("heading", { name: "Verify your email" })
  ).toBeInTheDocument()
  expect(screen.getByText(/code sent to ada@example.test/)).toBeInTheDocument()
  expect(
    await screen.findByText(/A verification code has been sent/)
  ).toBeInTheDocument()
  expect(
    requests.filter(
      (request) =>
        new URL(request.url).pathname ===
        "/api/auth/email-otp/send-verification-otp"
    )
  ).toHaveLength(1)
})

it("keeps credentials after the SDK rejects an invalid sign-in without sending an OTP", async () => {
  signInFailure = {
    status: 401,
    code: "INVALID_EMAIL_OR_PASSWORD",
    message: "Invalid email or password",
  }
  renderApp("/sign-in")
  fireEvent.change(await screen.findByLabelText(/^Email/), {
    target: { value: "ada@example.test" },
  })
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: "wrong-password" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Invalid email or password"
  )
  expect(screen.getByLabelText(/^Email/)).toHaveValue("ada@example.test")
  expect(screen.getByLabelText(/^Password/)).toHaveValue("wrong-password")
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled()
  expect(screen.queryByLabelText(/^Verification code/)).not.toBeInTheDocument()
  expect(
    requests.filter(
      (request) =>
        new URL(request.url).pathname ===
        "/api/auth/email-otp/send-verification-otp"
    )
  ).toHaveLength(0)
})

it("waits for the initial anonymous session before showing the sign-up form", async () => {
  const releaseSession = holdSession()
  renderApp("/sign-up")
  try {
    expect(screen.getByRole("status")).toHaveTextContent("Loading your session")
    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument()
  } finally {
    await act(async () => releaseSession())
  }
  expect(await screen.findByLabelText(/^Email/)).toBeInTheDocument()
})

it("keeps sign-up mounted through the SDK's anonymous session refresh and shows email verification", async () => {
  const { result } = renderApp("/sign-up")
  fireEvent.change(await screen.findByLabelText(/^Name/), {
    target: { value: "Ada Lovelace" },
  })
  fireEvent.change(screen.getByLabelText(/^Email/), {
    target: { value: "ada@example.test" },
  })
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: "long-password" },
  })
  const releaseSession = holdSession()
  fireEvent.click(screen.getByRole("button", { name: "Create account" }))
  try {
    await waitFor(() => expect(result.current.isPending).toBe(true))
    expect(result.current.data).toBeNull()
  } finally {
    await act(async () => releaseSession())
  }
  expect(
    await screen.findByRole("heading", { name: "Verify your email" })
  ).toBeInTheDocument()
  expect(screen.getByText(/code sent to ada@example.test/)).toBeInTheDocument()
  const resend = screen.getByRole("button", { name: "Resend code" })
  await waitFor(() => expect(resend).toBeEnabled())
  expect(
    requests.filter(
      (request) =>
        new URL(request.url).pathname ===
        "/api/auth/email-otp/send-verification-otp"
    )
  ).toHaveLength(0)
  fireEvent.click(resend)
  expect(
    await screen.findByText(/A verification code has been sent/)
  ).toBeInTheDocument()
  expect(
    requests.filter(
      (request) =>
        new URL(request.url).pathname ===
        "/api/auth/email-otp/send-verification-otp"
    )
  ).toHaveLength(1)
})

it("keeps the reset code and new password when the SDK refreshes during resend", async () => {
  const { result } = renderApp("/reset-password")
  fireEvent.change(await screen.findByLabelText(/^Email/), {
    target: { value: "ada@example.test" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Send reset code" }))
  fireEvent.change(await screen.findByLabelText(/^Reset code/), {
    target: { value: "123456" },
  })
  fireEvent.change(screen.getByLabelText(/^New password/), {
    target: { value: "new-password" },
  })
  const releaseSession = holdSession()
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Resend reset code" })
    ).toBeEnabled()
  )
  fireEvent.click(screen.getByRole("button", { name: "Resend reset code" }))
  let refreshing: Promise<void> | undefined
  act(() => {
    refreshing = result.current.refetch()
  })
  try {
    await waitFor(() => expect(result.current.isPending).toBe(true))
  } finally {
    await act(async () => {
      releaseSession()
      await refreshing
    })
  }
  expect(await screen.findByLabelText(/^Reset code/)).toHaveValue("123456")
  expect(screen.getByLabelText(/^New password/)).toHaveValue("new-password")
  expect(screen.getByText(/code sent to ada@example.test/)).toBeInTheDocument()
  expect(
    requests.filter(
      (request) =>
        new URL(request.url).pathname ===
        "/api/auth/email-otp/request-password-reset"
    )
  ).toHaveLength(2)
})

it("stops offering the anonymous form when the session refresh fails", async () => {
  const { result } = renderApp("/sign-up")
  expect(await screen.findByLabelText(/^Email/)).toBeInTheDocument()
  sessionFailure = true
  await act(async () => result.current.refetch())
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Authentication is unavailable"
  )
  expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "Retry authentication" })
  ).toBeEnabled()
})
