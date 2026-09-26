import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"

export const todos = pgTable("todos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: text().notNull(),
  completed: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const insertTodoSchema = createInsertSchema(todos, {
  title: (schema) => schema.trim().min(1),
}).pick({ title: true })
