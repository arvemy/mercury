import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"

export const todos = pgTable(
  "todos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ownerId: text().notNull(),
    title: text().notNull(),
    completed: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("todos_owner_id_idx").on(table.ownerId, table.id)]
)

export const insertTodoSchema = createInsertSchema(todos, {
  title: (schema) => schema.trim().min(1),
}).pick({ title: true })

export const todoFields = {
  id: todos.id,
  title: todos.title,
  completed: todos.completed,
  createdAt: todos.createdAt,
}
