import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseEnv } from "node:util"
import { z } from "zod"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const modes = z.enum(["development", "staging", "production"])
const appOrigin = z.url().refine((value) => {
  const url = URL.parse(value)
  return (
    url !== null &&
    ["http:", "https:"].includes(url.protocol) &&
    url.origin === value
  )
})
const authBaseUrl = z.url().refine((value) => {
  const url = URL.parse(value)
  return (
    url !== null &&
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname.endsWith("/auth")
  )
}, "must be the branch's HTTPS Neon Auth URL, including its auth path")
const postgresUrl = z.string().refine((value) => {
  try {
    const url = URL.parse(value)
    return (
      url !== null &&
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      Boolean(
        url &&
        url.hostname &&
        url.username &&
        url.password &&
        url.pathname !== "/"
      ) &&
      !url.hostname.includes("-pooler")
    )
  } catch {
    return false
  }
}, "must be a direct PostgreSQL connection URL")

export function loadEnvironment(files, environment = process.env) {
  const result = { ...environment }
  for (const file of files) {
    if (!existsSync(file)) continue
    const values = parseEnv(readFileSync(file, "utf8"))
    for (const [key, value] of Object.entries(values)) {
      if (result[key] === undefined) result[key] = value
    }
  }
  return result
}

export function loadDevelopmentEnvironment(
  directory = projectRoot,
  environment = process.env
) {
  const managed = loadEnvironment(
    [".env.local", ".env"].map((file) => resolve(directory, file)),
    {}
  )
  if (managed.DATABASE_URL_UNPOOLED)
    managed.DATABASE_URL = managed.DATABASE_URL_UNPOOLED
  const application = loadEnvironment(
    ["apps/api/.env", "apps/web/.env.local", "apps/web/.dev.vars"].map((file) =>
      resolve(directory, file)
    ),
    {}
  )
  const secretsFile = [".dev.vars.development", ".dev.vars"]
    .map((file) => resolve(directory, "apps/web", file))
    .find(existsSync)
  return {
    ...managed,
    ...Object.fromEntries(
      Object.entries(application).filter(([, value]) => value.trim() !== "")
    ),
    ...environment,
    ...(secretsFile
      ? {
          NEON_AUTH_COOKIE_SECRET:
            parseEnv(readFileSync(secretsFile, "utf8"))
              .NEON_AUTH_COOKIE_SECRET ?? "",
        }
      : {}),
  }
}

function requireConfiguration(schema, environment, instruction) {
  const result = schema.safeParse(environment)
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."))
    throw new Error(`${instruction}\nCheck ${[...new Set(fields)].join(", ")}.`)
  }
  return result.data
}

export function validateDevelopment(environment) {
  return requireConfiguration(
    z.object({
      DATABASE_URL: postgresUrl,
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: postgresUrl,
      NEON_AUTH_BASE_URL: authBaseUrl,
      NEON_AUTH_COOKIE_SECRET: z.string().min(32),
      APP_ORIGIN: appOrigin,
    }),
    environment,
    "Configure your Neon development branch and managed Neon Auth first. " +
      "See README.md. Copy apps/api/.env.example to .env, " +
      "apps/web/.env.example to .env.local, and apps/web/.dev.vars.example to .dev.vars."
  )
}

export function validateDeployment(environment, mode) {
  return requireConfiguration(
    z
      .object({
        DATABASE_URL: postgresUrl,
        CLOUDFLARE_ACCOUNT_ID: z.string().regex(/^[a-f\d]{32}$/i),
        HYPERDRIVE_ID: z
          .string()
          .regex(/^[a-f\d]{32}$/i)
          .refine((value) => !/^0+$/.test(value)),
        NEON_AUTH_BASE_URL: authBaseUrl,
        APP_ORIGIN: appOrigin.refine(
          (value) => URL.parse(value)?.protocol === "https:"
        ),
        CLOUDFLARE_CUSTOM_DOMAIN: z.string().min(1),
      })
      .refine(
        (value) =>
          URL.parse(value.APP_ORIGIN)?.host === value.CLOUDFLARE_CUSTOM_DOMAIN,
        { path: ["CLOUDFLARE_CUSTOM_DOMAIN"] }
      ),
    environment,
    `Configure the ${mode} deployment environment first. Remote commands never load local database credentials.`
  )
}

export function validateBuildTarget(directory, mode, environment) {
  const mismatch = new Error(
    `The prebuilt artifact does not match the ${mode} deployment settings. Rebuild for this environment before migrating or deploying.`
  )
  try {
    const context = JSON.parse(
      readFileSync(resolve(directory, "config.json"), "utf8")
    )
    const worker = JSON.parse(
      readFileSync(
        resolve(directory, "workers/default/worker.config.json"),
        "utf8"
      )
    )
    const valid = z
      .object({
        name: z.string().endsWith(`-${mode}`),
        domains: z
          .array(z.string())
          .refine((domains) =>
            domains.includes(environment.CLOUDFLARE_CUSTOM_DOMAIN)
          ),
        workersDev: z.literal(false),
        env: z.object({
          HYPERDRIVE: z.object({ id: z.literal(environment.HYPERDRIVE_ID) }),
          APP_ORIGIN: z.object({ value: z.literal(environment.APP_ORIGIN) }),
          NEON_AUTH_BASE_URL: z.object({
            value: z.literal(environment.NEON_AUTH_BASE_URL),
          }),
        }),
      })
      .safeParse(worker)
    if (
      context.buildContext?.mode !== mode ||
      context.buildContext?.isPreview !== false ||
      !valid.success
    )
      throw mismatch
  } catch {
    throw mismatch
  }
}

function run(args, { cwd = projectRoot, env = process.env } = {}) {
  const result = spawnSync("pnpm", args, { cwd, env, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    throw new Error(`Command failed: pnpm ${args.join(" ")}`)
  }
}

function generateTypes(mode) {
  run(["--dir", "apps/web", "exec", "cf", "workers", "types", "--mode", mode])
}

function migrate(env) {
  run(["--filter", "@workspace/api", "db:migrate"], { env })
}

export function main(args) {
  const [command, suppliedMode = "production"] = args
  const mode = modes.parse(suppliedMode)
  if (command === "types") {
    generateTypes(mode)
  } else if (command === "build") {
    generateTypes(mode)
    run(["exec", "turbo", "build", "--filter=!web"])
    run(["--dir", "apps/web", "run", "build", "--mode", mode])
  } else if (command === "dev") {
    const env = loadDevelopmentEnvironment()
    validateDevelopment(env)
    generateTypes("development")
    migrate(env)
    run(["exec", "turbo", "build", "--filter=@workspace/api"])
    run(["--dir", "apps/web", "dev"], { env })
  } else if (command === "migrate") {
    const env =
      mode === "development" ? loadDevelopmentEnvironment() : { ...process.env }
    requireConfiguration(
      z.object({ DATABASE_URL: postgresUrl }),
      env,
      `Set DATABASE_URL to the direct migration connection for ${mode}.`
    )
    migrate(env)
  } else if (command === "deploy") {
    if (mode === "development") {
      throw new Error(
        "Deployments require an explicit staging or production target."
      )
    }
    validateDeployment(process.env, mode)
    validateBuildTarget(
      resolve(projectRoot, "apps/web/.cloudflare/output/v0"),
      mode,
      process.env
    )
    const deploy = [
      "--dir",
      "apps/web",
      "exec",
      "cf",
      "deploy",
      "--prebuilt",
      "--mode",
      mode,
    ]
    run([...deploy, "--dry-run", "--provision=false"])
    migrate(process.env)
    const secretsFile = process.env.WORKER_SECRETS_FILE
    run([
      ...deploy,
      "--provision=false",
      ...(secretsFile ? ["--secrets-file", resolve(secretsFile)] : []),
    ])
  } else {
    throw new Error(
      "Usage: node scripts/project.mjs <types|build|dev|migrate|deploy> [development|staging|production]"
    )
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Project command failed."
    )
    process.exitCode = 1
  }
}
