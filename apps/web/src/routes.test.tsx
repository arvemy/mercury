import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MantineProvider } from "@mantine/core"
import { theme } from "@workspace/ui/theme"
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { routeTree } from "./routeTree.gen"
import type { AuthState } from "./lib/auth"
import { AuthContext } from "./lib/auth-context"

vi.mock("./lib/auth-client", () => ({ authClient: {} }))

type FetchImpl = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

function stubFetch(impl: FetchImpl) {
  vi.stubGlobal("fetch", vi.fn(impl))
}

function renderRoute(
  path: string,
  auth: AuthState = {
    status: "authenticated",
    userId: "user_a",
    sessionId: "session_a",
  }
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient, auth },
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={queryClient}>
        <AuthContext
          value={{ auth, refresh: async () => auth, signOut: async () => {} }}
        >
          <RouterProvider router={router} />
        </AuthContext>
      </QueryClientProvider>
    </MantineProvider>
  )
  return { router, queryClient }
}

const todo = {
  id: 1,
  title: "Buy milk",
  completed: false,
  createdAt: "2026-01-01T00:00:00.000Z",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("/", () => {
  it("shows the welcome copy and API status", async () => {
    stubFetch(async () => Response.json({ status: "ok" }))
    renderRoute("/")
    expect(await screen.findByText("Project ready!")).toBeInTheDocument()
    expect(await screen.findByText("API: ok")).toBeInTheDocument()
  })

  it("shows unreachable when the API call fails", async () => {
    stubFetch(async () => {
      throw new Error("network down")
    })
    renderRoute("/")
    expect(await screen.findByText("API: unreachable")).toBeInTheDocument()
  })
})

describe("/todos", () => {
  it("redirects anonymous visitors before fetching todos", async () => {
    const fetch = vi.fn(async () => Response.json([]))
    vi.stubGlobal("fetch", fetch)
    const { router } = renderRoute("/todos", { status: "anonymous" })
    expect(
      await screen.findByRole("heading", { name: "Sign in to your account" })
    ).toBeInTheDocument()
    expect(router.state.location.href).toBe("/sign-in?redirect=%2Ftodos")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("shows a session recovery action for unauthorized responses", async () => {
    stubFetch(async () =>
      Response.json({ error: "Unauthorized" }, { status: 401 })
    )
    renderRoute("/todos")
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your session expired"
    )
    expect(
      screen.getByRole("button", { name: "Sign in again" })
    ).toBeInTheDocument()
  })

  it("shows the empty state", async () => {
    stubFetch(async () => Response.json([]))
    renderRoute("/todos")
    expect(await screen.findByText("No todos yet.")).toBeInTheDocument()
  })

  it("lists todos", async () => {
    stubFetch(async () => Response.json([todo]))
    renderRoute("/todos")
    expect(await screen.findByText("Buy milk")).toBeInTheDocument()
  })

  it("adds a todo and refetches the list", async () => {
    const created = { ...todo, title: "New" }
    let posted = false
    stubFetch(async (_input, init) => {
      if (init?.method === "POST") {
        posted = true
        return Response.json(created, { status: 201 })
      }
      return Response.json(posted ? [created] : [])
    })
    renderRoute("/todos")
    fireEvent.change(await screen.findByLabelText("New todo"), {
      target: { value: "New" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    expect(await screen.findByText("New")).toBeInTheDocument()
    expect(screen.getByLabelText("New todo")).toHaveValue("")
  })

  it("shows an error and keeps the input when adding fails", async () => {
    stubFetch(async (_input, init) =>
      init?.method === "POST"
        ? Response.json({}, { status: 500 })
        : Response.json([])
    )
    renderRoute("/todos")
    fireEvent.change(await screen.findByLabelText("New todo"), {
      target: { value: "New" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't add the todo. Try again."
    )
    expect(screen.getByLabelText("New todo")).toHaveValue("New")
  })
})

it("waits for authentication and hides the previous user's data during an account change", async () => {
  const { AuthRouter } = await import("./lib/auth-router")
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient, auth: { status: "loading" } },
    history: createMemoryHistory({ initialEntries: ["/todos"] }),
  })
  let currentUser = "a"
  let finishSecondUser: ((response: Response) => void) | undefined
  const fetch = vi.fn(async () =>
    currentUser === "a"
      ? Response.json([{ ...todo, title: "User A private todo" }])
      : new Promise<Response>((resolve) => {
          finishSecondUser = resolve
        })
  )
  vi.stubGlobal("fetch", fetch)
  function Fixture({ auth }: { auth: AuthState }) {
    return (
      <MantineProvider theme={theme} env="test">
        <QueryClientProvider client={queryClient}>
          <AuthContext
            value={{ auth, refresh: async () => auth, signOut: async () => {} }}
          >
            <AuthRouter
              history={router.history}
              queryClient={queryClient}
              auth={auth}
            />
          </AuthContext>
        </QueryClientProvider>
      </MantineProvider>
    )
  }
  const view = render(<Fixture auth={{ status: "loading" }} />)
  expect(screen.getByRole("status")).toHaveTextContent("Loading your session")
  expect(fetch).not.toHaveBeenCalled()
  view.rerender(
    <Fixture
      auth={{
        status: "authenticated",
        userId: "user_a",
        sessionId: "session_a",
      }}
    />
  )
  expect(await screen.findByText("User A private todo")).toBeInTheDocument()
  const callsBeforeRenewal = fetch.mock.calls.length
  view.rerender(
    <Fixture
      auth={{
        status: "authenticated",
        userId: "user_a",
        sessionId: "session_a",
      }}
    />
  )
  expect(screen.getByText("User A private todo")).toBeInTheDocument()
  expect(
    queryClient.getQueryData(["private", "user_a", "session_a", "todos"])
  ).toBeDefined()
  expect(fetch).toHaveBeenCalledTimes(callsBeforeRenewal)
  currentUser = "b"
  view.rerender(
    <Fixture
      auth={{
        status: "authenticated",
        userId: "user_b",
        sessionId: "session_b",
      }}
    />
  )
  expect(screen.queryByText("User A private todo")).not.toBeInTheDocument()
  await vi.waitFor(() => expect(finishSecondUser).toBeDefined())
  finishSecondUser?.(Response.json([{ ...todo, title: "User B private todo" }]))
  expect(await screen.findByText("User B private todo")).toBeInTheDocument()
  expect(
    queryClient.getQueryData(["private", "user_a", "session_a", "todos"])
  ).toBeUndefined()
  view.rerender(<Fixture auth={{ status: "anonymous" }} />)
  expect(screen.queryByText("User B private todo")).not.toBeInTheDocument()
  expect(
    await screen.findByRole("heading", { name: "Sign in to your account" })
  ).toBeInTheDocument()
  expect(
    queryClient.getQueryCache().findAll({ queryKey: ["private"] })
  ).toHaveLength(0)
})

it("isolates a new session for the same user and cancels outstanding private requests", async () => {
  const { AuthRouter } = await import("./lib/auth-router")
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const history = createMemoryHistory({ initialEntries: ["/todos"] })
  let latest = "First session private todo"
  stubFetch(async () => Response.json([{ ...todo, title: latest }]))
  function Fixture({ auth }: { auth: AuthState }) {
    return (
      <MantineProvider env="test">
        <QueryClientProvider client={queryClient}>
          <AuthContext
            value={{ auth, refresh: async () => auth, signOut: async () => {} }}
          >
            <AuthRouter
              auth={auth}
              queryClient={queryClient}
              history={history}
            />
          </AuthContext>
        </QueryClientProvider>
      </MantineProvider>
    )
  }
  const view = render(
    <Fixture
      auth={{ status: "authenticated", userId: "alice", sessionId: "first" }}
    />
  )
  expect(
    await screen.findByText("First session private todo")
  ).toBeInTheDocument()
  let aborted = false
  const request = queryClient
    .fetchQuery({
      queryKey: ["private", "alice", "first", "pending"],
      queryFn: ({ signal }) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true
            resolve([])
          })
        }),
    })
    .catch(() => undefined)
  latest = "Second session private todo"
  view.rerender(
    <Fixture
      auth={{ status: "authenticated", userId: "alice", sessionId: "second" }}
    />
  )
  expect(
    screen.queryByText("First session private todo")
  ).not.toBeInTheDocument()
  expect(
    await screen.findByText("Second session private todo")
  ).toBeInTheDocument()
  await request
  expect(aborted).toBe(true)
  expect(
    queryClient.getQueryData(["private", "alice", "first", "todos"])
  ).toBeUndefined()
})
