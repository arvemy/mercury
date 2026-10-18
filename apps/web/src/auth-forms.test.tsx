import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MantineProvider } from "@mantine/core"
import { AuthApiError } from "@neondatabase/auth"
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { routeTree } from "./routeTree.gen"
import { AuthContext, type AuthControls } from "./lib/auth-context"
import type { AuthState } from "./lib/auth"

const sdk = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  sendCode: vi.fn(),
  verifyEmail: vi.fn(),
  requestReset: vi.fn(),
  resetPassword: vi.fn(),
}))
vi.mock("./lib/auth-client", () => ({
  authClient: {
    signIn: { email: sdk.signIn },
    signUp: { email: sdk.signUp },
    emailOtp: {
      sendVerificationOtp: sdk.sendCode,
      verifyEmail: sdk.verifyEmail,
      requestPasswordReset: sdk.requestReset,
      resetPassword: sdk.resetPassword,
    },
  },
}))

function renderAuth(path: string, controls: Partial<AuthControls> = {}) {
  const auth: AuthState = controls.auth ?? { status: "anonymous" }
  const refresh =
    controls.refresh ??
    vi.fn(async (): Promise<AuthState> => ({ status: "anonymous" }))
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient, auth },
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <MantineProvider env="test">
      <QueryClientProvider client={queryClient}>
        <AuthContext
          value={{ auth, refresh, signOut: controls.signOut ?? vi.fn() }}
        >
          <RouterProvider router={router} />
        </AuthContext>
      </QueryClientProvider>
    </MantineProvider>
  )
  return { router, refresh }
}

async function fillCredentials(signUp = false) {
  if (signUp)
    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: "Ada Lovelace" },
    })
  fireEvent.change(await screen.findByLabelText(/^Email/), {
    target: { value: "ada@example.com" },
  })
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: "long-password" },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const method of Object.values(sdk))
    method.mockResolvedValue({ data: {}, error: null })
})

describe("sign in", () => {
  it("keeps credentials and reports provider errors", async () => {
    sdk.signIn.mockResolvedValue({
      data: null,
      error: {
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      },
    })
    renderAuth("/sign-in")
    await fillCredentials()
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password"
    )
    expect(screen.getByLabelText(/^Email/)).toHaveValue("ada@example.com")
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled()
  })

  it("disables duplicate submissions while waiting and rejects fake session success", async () => {
    let finish: ((value: { data: object; error: null }) => void) | undefined
    sdk.signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const { refresh } = renderAuth("/sign-in")
    await fillCredentials()
    const button = screen.getByRole("button", { name: "Sign in" })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(sdk.signIn).toHaveBeenCalledTimes(1)
    finish?.({ data: {}, error: null })
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign in did not create a session"
    )
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("offers verification and resend for an unverified account", async () => {
    sdk.signIn.mockResolvedValue({
      data: null,
      error: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
    })
    renderAuth("/sign-in?redirect=%2Ftodos")
    await fillCredentials()
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(
      await screen.findByRole("heading", { name: "Verify your email" })
    ).toBeInTheDocument()
    expect(sdk.sendCode).toHaveBeenCalledWith({
      email: "ada@example.com",
      type: "email-verification",
    })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }))
    await waitFor(() => expect(sdk.sendCode).toHaveBeenCalledTimes(2))
  })

  it("shows an actionable service error", async () => {
    sdk.signIn.mockRejectedValue(new Error("Network unavailable. Try again."))
    renderAuth("/sign-in")
    await fillCredentials()
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Network unavailable"
    )
  })
})

describe("sign up", () => {
  it("waits for the managed signup code and only sends another code on explicit resend", async () => {
    renderAuth("/sign-up")
    await fillCredentials(true)
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))
    expect(
      await screen.findByRole("heading", { name: "Verify your email" })
    ).toBeInTheDocument()
    const resend = screen.getByRole("button", { name: "Resend code" })
    await waitFor(() => expect(resend).toBeEnabled())
    expect(sdk.sendCode).not.toHaveBeenCalled()
    fireEvent.click(resend)
    expect(
      await screen.findByText(/A verification code has been sent/)
    ).toBeInTheDocument()
    expect(sdk.sendCode).toHaveBeenCalledTimes(1)
    expect(sdk.sendCode).toHaveBeenCalledWith({
      email: "ada@example.com",
      type: "email-verification",
    })
  })

  it("keeps signup errors on the credentials form without sending a code", async () => {
    sdk.signUp.mockResolvedValue({
      data: null,
      error: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
    })
    const { refresh } = renderAuth("/sign-up")
    await fillCredentials(true)
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email not verified"
    )
    expect(screen.getByLabelText(/^Email/)).toHaveValue("ada@example.com")
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled()
    expect(
      screen.queryByLabelText(/^Verification code/)
    ).not.toBeInTheDocument()
    expect(sdk.sendCode).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("navigates after signup creates an authenticated session without sending a code", async () => {
    const refresh = vi.fn(async (): Promise<AuthState> => ({
      status: "authenticated",
      userId: "ada",
      sessionId: "ada-session",
    }))
    const { router } = renderAuth("/sign-up?redirect=%2F", { refresh })
    await fillCredentials(true)
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))
    expect(
      await screen.findByRole("heading", { name: "Project ready!" })
    ).toBeInTheDocument()
    expect(router.state.location.href).toBe("/")
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(sdk.sendCode).not.toHaveBeenCalled()
    expect(
      screen.queryByLabelText(/^Verification code/)
    ).not.toBeInTheDocument()
  })

  it("keeps rejected SDK verification errors on the signup credentials form", async () => {
    sdk.signUp.mockRejectedValue(
      new AuthApiError(
        "Email verification required",
        422,
        "email_not_confirmed"
      )
    )
    const { refresh } = renderAuth("/sign-up")
    await fillCredentials(true)
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email verification required"
    )
    expect(screen.getByLabelText(/^Email/)).toHaveValue("ada@example.com")
    expect(screen.getByLabelText(/^Password/)).toHaveValue("long-password")
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled()
    expect(
      screen.queryByLabelText(/^Verification code/)
    ).not.toBeInTheDocument()
    expect(sdk.sendCode).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("sends the name and safe callback and verifies an emailed code without inventing a session", async () => {
    const { router, refresh } = renderAuth(
      "/sign-up?redirect=https%3A%2F%2Fevil.example"
    )
    await fillCredentials(true)
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))
    const field = await screen.findByLabelText(/^Verification code/)
    expect(sdk.signUp).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "long-password",
      callbackURL: `${window.location.origin}/todos`,
    })
    fireEvent.change(field, { target: { value: "123456" } })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Verify email" })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }))
    expect(
      await screen.findByRole("heading", { name: "Sign in to your account" })
    ).toBeInTheDocument()
    expect(sdk.verifyEmail).toHaveBeenCalledWith({
      email: "ada@example.com",
      otp: "123456",
    })
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(router.state.location.href).toBe("/sign-in?redirect=%2Ftodos")
  })

  it("shows resend failures while keeping the verification form usable", async () => {
    sdk.sendCode.mockResolvedValue({
      data: null,
      error: { message: "Email delivery unavailable" },
    })
    renderAuth("/sign-up")
    await fillCredentials(true)
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))
    const resend = await screen.findByRole("button", { name: "Resend code" })
    await waitFor(() => expect(resend).toBeEnabled())
    fireEvent.click(resend)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email delivery unavailable"
    )
    expect(screen.getByLabelText(/^Verification code/)).toBeEnabled()
    expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled()
  })
})

describe("password recovery", () => {
  it("requests and resends a code then resets the password with the code", async () => {
    renderAuth("/reset-password?redirect=%2Ftodos%3Ffilter%3Dopen")
    fireEvent.change(await screen.findByLabelText(/^Email/), {
      target: { value: "ada@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }))
    fireEvent.change(await screen.findByLabelText(/^Reset code/), {
      target: { value: "654321" },
    })
    fireEvent.change(screen.getByLabelText(/^New password/), {
      target: { value: "new-password" },
    })
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Resend reset code" })
      ).toBeEnabled()
    )
    fireEvent.click(screen.getByRole("button", { name: "Resend reset code" }))
    await waitFor(() => expect(sdk.requestReset).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Reset password" })
      ).toBeEnabled()
    )
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }))
    expect(
      await screen.findByText(
        "Your password has been reset. Sign in with your new password."
      )
    ).toBeInTheDocument()
    expect(sdk.resetPassword).toHaveBeenCalledWith({
      email: "ada@example.com",
      otp: "654321",
      password: "new-password",
    })
    expect(
      screen.getByRole("link", { name: "Back to sign in" })
    ).toHaveAttribute("href", "/sign-in?redirect=%2Ftodos%3Ffilter%3Dopen")
  })

  it("keeps the code and new password after an invalid code", async () => {
    sdk.resetPassword.mockResolvedValue({
      data: null,
      error: { message: "Invalid or expired code" },
    })
    renderAuth("/reset-password")
    fireEvent.change(await screen.findByLabelText(/^Email/), {
      target: { value: "ada@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }))
    fireEvent.change(await screen.findByLabelText(/^Reset code/), {
      target: { value: "000000" },
    })
    fireEvent.change(screen.getByLabelText(/^New password/), {
      target: { value: "new-password" },
    })
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Reset password" })
      ).toBeEnabled()
    )
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid or expired code"
    )
    expect(screen.getByLabelText(/^Reset code/)).toHaveValue("000000")
    expect(screen.getByRole("button", { name: "Reset password" })).toBeEnabled()
  })
})
