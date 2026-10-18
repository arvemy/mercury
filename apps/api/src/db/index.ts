import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import * as schema from "./schema.js"

const createDatabase = (client: Client) => drizzle(client, { schema })

export async function withDatabase<Result>({
  connectionString,
  run,
}: {
  connectionString: string
  run: (db: ReturnType<typeof createDatabase>) => Promise<Result>
}) {
  const client = new Client({ connectionString })
  try {
    await client.connect()
    return await run(createDatabase(client))
  } finally {
    await client.end()
  }
}
