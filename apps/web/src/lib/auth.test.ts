import { describe, expect, it } from "vite-plus/test"
import { QueryClient } from "@tanstack/react-query"
import { safeReturnTo } from "./auth"
import { clearPrivateCache, todosQuery } from "./queries"

describe("return destination", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\nevil.example",
    undefined,
    "/sign-in?redirect=/todos",
    "/sign-up",
    "/reset-password",
  ])("rejects external or malformed destination %s", (value) => {
    expect(safeReturnTo(value)).toBe("/todos")
  })
  it("preserves a relative path, search, and fragment", () => {
    expect(safeReturnTo("/todos?filter=open#new")).toBe(
      "/todos?filter=open#new"
    )
  })
})

it("isolates users and cancels private requests before removing their cache", async () => {
  const client = new QueryClient()
  client.setQueryData(todosQuery("user_a", "session_a").queryKey, [
    {
      id: 1,
      title: "A's private todo",
      completed: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ])
  client.setQueryData(["health"], { status: "ok" })
  expect(
    client.getQueryData(todosQuery("user_b", "session_b").queryKey)
  ).toBeUndefined()
  let aborted = false
  const request = client
    .fetchQuery({
      queryKey: ["private", "user_a", "pending"],
      queryFn: ({ signal }) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true
            resolve([])
          })
        }),
    })
    .catch(() => undefined)
  await clearPrivateCache(client)
  await request
  expect(aborted).toBe(true)
  expect(
    client.getQueryCache().findAll({ queryKey: ["private"] })
  ).toHaveLength(0)
  expect(client.getQueryData(["health"])).toEqual({ status: "ok" })
})
