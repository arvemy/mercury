import { existsSync } from "node:fs"
import { fileURLToPath, URL } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"
import { z } from "zod"

if (existsSync(".env")) process.loadEnvFile()

const connectionString = z.url().parse(process.env.DATABASE_URL)
const client = new Client({ connectionString })
try {
  await client.connect()
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  })
  process.stdout.write("Migrations applied\n")
} finally {
  await client.end()
}
