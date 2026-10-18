import { randomUUID } from "node:crypto"
import { fileURLToPath, URL } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vite-plus/test"
import { z } from "zod"
import { app } from "./app.js"
import {
  appOrigin,
  sessionHeaders,
  sessionCookie,
  startAuthProvider,
  testBindings,
} from "./test/auth.js"

const databaseUrl = z.url().parse(process.env.TEST_DATABASE_URL)
const schemaName = `mercury_test_${randomUUID().replaceAll("-", "")}`
const scopedUrl = new URL(databaseUrl)
scopedUrl.searchParams.set("options", `-c search_path=${schemaName}`)
scopedUrl.searchParams.set("application_name", schemaName)
const provider = await startAuthProvider()
const bindings = testBindings(scopedUrl.toString(), provider.baseUrl)
const admin = new Client({ connectionString: databaseUrl })

describe("todo ownership with Postgres and managed session HTTP fixtures", () => {
  beforeAll(async () => {
    await admin.connect()
    await admin.query(`CREATE SCHEMA "${schemaName}"`)
    const client = new Client({ connectionString: scopedUrl.toString() })
    try {
      await client.connect()
      await migrate(drizzle(client), {
        migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
        migrationsSchema: schemaName,
      })
    } finally {
      await client.end()
    }
  })

  beforeEach(async () => {
    await admin.query(`DELETE FROM "${schemaName}"."todos"`)
  })

  afterAll(async () => {
    try {
      await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    } finally {
      await admin.end()
      await provider.close()
    }
  })

  it("stores the verified owner and isolates both users in both directions", async () => {
    const aliceHeaders = sessionHeaders("user_alice")
    const bobHeaders = sessionHeaders("user_bob")
    const alicePost = await app.request(
      "/api/todos",
      {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({ title: "  Alice private todo  " }),
      },
      bindings
    )
    expect(alicePost.status).toBe(201)
    const aliceTodo = await alicePost.json()
    expect(aliceTodo).toEqual({
      id: expect.any(Number),
      title: "Alice private todo",
      completed: false,
      createdAt: expect.any(String),
    })
    expect(alicePost.headers.get("Cache-Control")).toBe("private, no-store")

    const bobEmpty = await app.request(
      "/api/todos",
      { headers: bobHeaders },
      bindings
    )
    expect(bobEmpty.status).toBe(200)
    expect(await bobEmpty.json()).toEqual([])

    const bobPost = await app.request(
      "/api/todos",
      {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ title: "Bob private todo" }),
      },
      bindings
    )
    expect(bobPost.status).toBe(201)
    const bobTodo = await bobPost.json()

    const aliceGet = await app.request(
      "/api/todos",
      { headers: aliceHeaders },
      bindings
    )
    const bobGet = await app.request(
      "/api/todos",
      { headers: bobHeaders },
      bindings
    )
    expect(await aliceGet.json()).toEqual([aliceTodo])
    expect(await bobGet.json()).toEqual([bobTodo])
    expect(aliceGet.headers.get("Cache-Control")).toBe("private, no-store")

    const persisted = await admin.query<{ title: string; ownerId: string }>(
      `SELECT title, "ownerId" FROM "${schemaName}"."todos" ORDER BY id`
    )
    expect(persisted.rows).toEqual([
      { title: "Alice private todo", ownerId: "user_alice" },
      { title: "Bob private todo", ownerId: "user_bob" },
    ])
  })

  it("accepts a valid same-origin session cookie", async () => {
    const res = await app.request(
      "/api/todos",
      {
        method: "POST",
        headers: {
          Cookie: sessionCookie("token_user_cookie"),
          Origin: appOrigin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Cookie-authenticated todo" }),
      },
      bindings
    )
    expect(res.status).toBe(201)
    const persisted = await admin.query<{ ownerId: string }>(
      `SELECT "ownerId" FROM "${schemaName}"."todos"`
    )
    expect(persisted.rows).toEqual([{ ownerId: "user_cookie" }])
  })

  it("ignores client-supplied fields and assigns ownership from the verified session", async () => {
    const res = await app.request(
      "/api/todos",
      {
        method: "POST",
        headers: sessionHeaders(),
        body: JSON.stringify({
          title: "forged owner",
          ownerId: "user_bob",
          id: 999999,
          completed: true,
          createdAt: "2000-01-01T00:00:00.000Z",
        }),
      },
      bindings
    )
    expect(res.status).toBe(201)
    const created = await res.json()
    expect(created).toEqual({
      id: expect.any(Number),
      title: "forged owner",
      completed: false,
      createdAt: expect.any(String),
    })
    expect(created).not.toMatchObject({ id: 999999 })
    expect(created).not.toMatchObject({ createdAt: "2000-01-01T00:00:00.000Z" })
    const persisted = await admin.query<{ ownerId: string }>(
      `SELECT "ownerId" FROM "${schemaName}"."todos"`
    )
    expect(persisted.rows).toEqual([{ ownerId: "user_alice" }])
    const bobGet = await app.request(
      "/api/todos",
      { headers: sessionHeaders("user_bob") },
      bindings
    )
    expect(bobGet.status).toBe(200)
    expect(await bobGet.json()).toEqual([])
  })

  it("closes each request connection after concurrent reads", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, async () =>
        app.request("/api/todos", { headers: sessionHeaders() }, bindings)
      )
    )
    expect(responses.map((response) => response.status)).toEqual(
      Array(8).fill(200)
    )
    const connections = await admin.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1",
      [schemaName]
    )
    expect(connections.rows).toEqual([{ count: 0 }])
  })
})
