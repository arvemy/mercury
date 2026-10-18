import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MantineProvider } from "@mantine/core"
import { createMemoryHistory } from "@tanstack/react-router"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test"
import { AuthProvider } from "./lib/auth-provider"
import { useAppAuth } from "./lib/auth-context"
import { AuthRouter } from "./lib/auth-router"
import { authUnavailableMessage } from "./lib/auth"

const sdk = vi.hoisted(() => {
  type Data = { user: { id: string }; session: { id: string; userId: string } }
  const snapshot: {
    data: Data | null
    error: Error | null
    isPending: boolean
    isRefetching: boolean
  } = { data: null, error: null, isPending: false, isRefetching: false }
  return {
    snapshot,
    listeners: new Set<() => void>(),
    getSession: vi.fn(),
    signOut: vi.fn(),
    refetch: vi.fn(),
  }
})
vi.mock("./lib/auth-client", async () => {
  const { useSyncExternalStore } = await import("react")
  return {
    authClient: {
      useSession: () => ({
        ...useSyncExternalStore(
          (listener) => {
            sdk.listeners.add(listener)
            return () => sdk.listeners.delete(listener)
          },
          () => sdk.snapshot
        ),
        refetch: sdk.refetch,
      }),
      getSession: sdk.getSession,
      signOut: sdk.signOut,
    },
  }
})

function setSession(
  data: typeof sdk.snapshot.data,
  error: Error | null = null
) {
  sdk.snapshot = { data, error, isPending: false, isRefetching: false }
  for (const listener of sdk.listeners) listener()
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
  const view = render(
    <MantineProvider env="test">
      <QueryClientProvider client={queryClient}>
        <AuthProvider queryClient={queryClient}>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
  return { queryClient, history, view }
}

beforeEach(() => {
  vi.resetAllMocks()
  sdk.snapshot = {
    data: {
      user: { id: "alice" },
      session: { id: "session-alice", userId: "alice" },
    },
    error: null,
    isPending: false,
    isRefetching: false,
  }
  sdk.getSession.mockImplementation(async () => ({
    data: sdk.snapshot.data,
    error: sdk.snapshot.error,
  }))
  sdk.refetch.mockResolvedValue(undefined)
  sdk.signOut.mockImplementation(async () => {
    setSession(null)
    return { data: { success: true }, error: null }
  })
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json([
        {
          id: 1,
          title: "Alice private todo",
          completed: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ])
    )
  )
})
afterEach(() => vi.unstubAllGlobals())

it("keeps the public Home available when authentication is unconfigured", async () => {
  setSession(null, new Error("Missing configuration"))
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "ok" }))
  )
  renderApp("/")
  expect(await screen.findByText("Project ready!")).toBeInTheDocument()
  expect(await screen.findByText("API: ok")).toBeInTheDocument()
})

it.each(["/todos", "/sign-in", "/sign-up", "/reset-password"])(
  "shows retry instead of anonymous access when auth fails on %s",
  async (path) => {
    setSession(null, new Error("Missing configuration"))
    const { history } = renderApp(path)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      authUnavailableMessage
    )
    expect(
      screen.getByRole("button", { name: "Retry authentication" })
    ).toBeEnabled()
    expect(history.location.pathname).toBe(path)
    expect(fetch).not.toHaveBeenCalled()
  }
)

it("immediately hides private data during sign out and clears it before showing sign in", async () => {
  let finish: (() => void) | undefined
  sdk.signOut.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => {
          setSession(null)
          resolve({ data: { success: true }, error: null })
        }
      })
  )
  const { queryClient } = renderApp("/todos")
  expect(await screen.findByText("Alice private todo")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
  expect(screen.queryByText("Alice private todo")).not.toBeInTheDocument()
  await waitFor(() => expect(sdk.signOut).toHaveBeenCalledTimes(1))
  expect(
    queryClient.getQueryCache().findAll({ queryKey: ["private"] })
  ).toHaveLength(0)
  await act(async () => finish?.())
  expect(
    await screen.findByRole("heading", { name: "Sign in to your account" })
  ).toBeInTheDocument()
  expect(sdk.getSession).toHaveBeenCalledWith({
    query: { disableCookieCache: true },
  })
  expect(sdk.refetch).toHaveBeenCalledWith({
    query: { disableCookieCache: true },
  })
})

it("keeps failed sign out hidden and offers a working retry", async () => {
  sdk.signOut.mockResolvedValueOnce({
    data: null,
    error: { message: "Network down" },
  })
  renderApp("/todos")
  expect(await screen.findByText("Alice private todo")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "couldn't confirm sign out"
  )
  expect(screen.queryByText("Alice private todo")).not.toBeInTheDocument()
  expect(
    screen.queryByRole("heading", { name: "Sign in to your account" })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Retry sign out" }))
  expect(
    await screen.findByRole("heading", { name: "Sign in to your account" })
  ).toBeInTheDocument()
  expect(sdk.signOut).toHaveBeenCalledTimes(2)
})

it("does not report logout if the provider still returns a session", async () => {
  sdk.signOut.mockResolvedValue({ data: { success: true }, error: null })
  renderApp("/todos")
  expect(await screen.findByText("Alice private todo")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "couldn't confirm sign out"
  )
  expect(screen.queryByText("Alice private todo")).not.toBeInTheDocument()
})

it("removes private data when API authorization expires and confirms the current session", async () => {
  const { queryClient } = renderApp("/todos")
  expect(await screen.findByText("Alice private todo")).toBeInTheDocument()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 401 }))
  )
  sdk.getSession.mockImplementation(async () => {
    setSession(null)
    return { data: null, error: null }
  })
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ["private"] })
  })
  expect(
    await screen.findByRole("heading", { name: "Sign in to your account" })
  ).toBeInTheDocument()
  expect(screen.queryByText("Alice private todo")).not.toBeInTheDocument()
  expect(
    queryClient.getQueryCache().findAll({ queryKey: ["private"] })
  ).toHaveLength(0)
})
