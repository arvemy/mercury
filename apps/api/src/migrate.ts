import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import { env } from "./env.js"

const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} })
await migrate(drizzle(client), {
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
})
await client.end()
console.log("Migrations applied")
