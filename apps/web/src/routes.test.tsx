import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { routeTree } from "./routeTree.gen"

type FetchImpl = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

function stubFetch(impl: FetchImpl) {
  vi.stubGlobal("fetch", vi.fn(impl))
}

function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
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
