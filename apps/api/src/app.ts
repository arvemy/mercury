import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { proxyAuth, requireUser, type ApiEnv } from "./auth.js"
import { withDatabase } from "./db/index.js"
import { insertTodoSchema, todoFields, todos } from "./db/schema.js"

const helloQuery = z.object({ name: z.string().min(1) })
const routes = new Hono<ApiEnv>()
  .basePath("/api")
  .get("/health", (c) => c.json({ status: "ok" }))
  .get("/hello", zValidator("query", helloQuery), (c) => {
    const { name } = c.req.valid("query")
    return c.json({ message: `Hello, ${name}!` })
  })
  .all("/auth/*", proxyAuth)
  .use("/todos/*", requireUser)
  .get("/todos", (c) =>
    withDatabase({
      connectionString: c.env.HYPERDRIVE.connectionString,
      run: async (db) => {
        const rows = await db
          .select(todoFields)
          .from(todos)
          .where(eq(todos.ownerId, c.get("ownerId")))
          .orderBy(todos.id)
        return c.json(rows)
      },
    })
  )
  .post("/todos", zValidator("json", insertTodoSchema), (c) =>
    withDatabase({
      connectionString: c.env.HYPERDRIVE.connectionString,
      run: async (db) => {
        const [row] = await db
          .insert(todos)
          .values({ ...c.req.valid("json"), ownerId: c.get("ownerId") })
          .returning(todoFields)
        return c.json(row, 201)
      },
    })
  )

export const app = new Hono().route("/", routes)
export type AppType = typeof app
