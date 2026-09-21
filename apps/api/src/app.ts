import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { logger } from "hono/logger"
import { z } from "zod"
import { db } from "./db/index.js"
import { insertTodoSchema, todos } from "./db/schema.js"

const helloQuery = z.object({ name: z.string().min(1) })

const app = new Hono()
  .basePath("/api")
  .use(logger())
  .get("/health", (c) => c.json({ status: "ok" }))
  .get("/hello", zValidator("query", helloQuery), (c) => {
    const { name } = c.req.valid("query")
    return c.json({ message: `Hello, ${name}!` })
  })
  .get("/todos", async (c) => {
    const rows = await db.select().from(todos).orderBy(todos.id)
    return c.json(rows)
  })
  .post("/todos", zValidator("json", insertTodoSchema), async (c) => {
    const [row] = await db.insert(todos).values(c.req.valid("json")).returning()
    return c.json(row, 201)
  })

export { app }
export type AppType = typeof app
