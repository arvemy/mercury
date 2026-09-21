import { existsSync } from "node:fs"
import { z } from "zod"

if (existsSync(".env")) process.loadEnvFile()

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n")
  throw new Error(`Invalid environment variables:\n${issues}`)
}

export const env = parsed.data
