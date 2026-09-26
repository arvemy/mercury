import { sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { app } from "./app.js"
import { db } from "./db/index.js"

const dbUp = await Promise.race([
  db.execute(sql`select 1`).then(
    () => true,
    () => false
  ),
  new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
])

if (!dbUp) {
  process.stderr.write(
    "todos.test.ts: database unreachable, skipping todos suite\n"
  )
  await db.$client.end({ timeout: 0 })
}

const truncate = () => db.execute(sql`TRUNCATE todos RESTART IDENTITY`)

describe.skipIf(!dbUp)("todos", () => {
  beforeEach(truncate)

  afterAll(async () => {
    await truncate()
    await db.$client.end()
  })

  it("GET /api/todos is empty", async () => {
    const res = await app.request("/api/todos")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it("POST /api/todos creates a row that GET returns", async () => {
    const post = await app.request("/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    })
    expect(post.status).toBe(201)
    const created = await post.json()
    expect(created).toMatchObject({
      id: 1,
      title: "x",
      completed: false,
      createdAt: expect.any(String),
    })

    const get = await app.request("/api/todos")
    expect(await get.json()).toEqual([created])
  })

  it("POST /api/todos stores a trimmed title", async () => {
    const res = await app.request("/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "  Buy milk  " }),
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ title: "Buy milk" })
  })

  it("POST /api/todos with a whitespace-only title is 400", async () => {
    const res = await app.request("/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    })
    expect(res.status).toBe(400)
  })

  it("POST /api/todos with empty title is 400", async () => {
    const res = await app.request("/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    })
    expect(res.status).toBe(400)
  })
})
