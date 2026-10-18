import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  loadEnvironment,
  loadDevelopmentEnvironment,
  validateBuildTarget,
  validateDevelopment,
  validateDeployment,
} from "./project.mjs"

const databaseUrl = "postgresql://migrator:private-password@db.example.test/app"

test("environment files never replace explicitly supplied credentials", () => {
  const directory = mkdtempSync(join(tmpdir(), "mercury-env-"))
  try {
    const file = join(directory, ".env")
    writeFileSync(
      file,
      "DATABASE_URL=file-value\nAPP_ORIGIN=http://localhost:5173\n"
    )
    assert.deepEqual(loadEnvironment([file], { DATABASE_URL: databaseUrl }), {
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: "http://localhost:5173",
    })
  } finally {
    rmSync(directory, { recursive: true })
  }
})

test("Neon CLI environment supplies the direct migration URL without overriding explicit targets", () => {
  const directory = mkdtempSync(join(tmpdir(), "mercury-neon-env-"))
  try {
    writeFileSync(
      join(directory, ".env.local"),
      `DATABASE_URL=postgresql://owner:secret@ep-example-pooler.neon.tech/neondb\nDATABASE_URL_UNPOOLED=${databaseUrl}\nNEON_AUTH_BASE_URL=https://auth.example.test/neondb/auth\n`
    )
    const managed = loadDevelopmentEnvironment(directory, {})
    assert.equal(managed.DATABASE_URL, databaseUrl)
    assert.equal(
      managed.NEON_AUTH_BASE_URL,
      "https://auth.example.test/neondb/auth"
    )
    const explicit = "postgresql://other:secret@another.example.test/staging"
    assert.equal(
      loadDevelopmentEnvironment(directory, { DATABASE_URL: explicit })
        .DATABASE_URL,
      explicit
    )
    mkdirSync(join(directory, "apps/api"), { recursive: true })
    mkdirSync(join(directory, "apps/web"), { recursive: true })
    writeFileSync(join(directory, "apps/api/.env"), "DATABASE_URL=\n")
    writeFileSync(
      join(directory, "apps/web/.env.local"),
      "NEON_AUTH_BASE_URL=\n"
    )
    const copiedExamples = loadDevelopmentEnvironment(directory, {})
    assert.equal(copiedExamples.DATABASE_URL, databaseUrl)
    assert.equal(
      copiedExamples.NEON_AUTH_BASE_URL,
      "https://auth.example.test/neondb/auth"
    )
    assert.equal(
      loadDevelopmentEnvironment(directory, { DATABASE_URL: "" }).DATABASE_URL,
      ""
    )
    writeFileSync(
      join(directory, "apps/api/.env"),
      `DATABASE_URL=${explicit}\n`
    )
    assert.equal(
      loadDevelopmentEnvironment(directory, {}).DATABASE_URL,
      explicit
    )
  } finally {
    rmSync(directory, { recursive: true })
  }
})

test("development validates the cookie secret selected by Cloudflare's dev vars files", () => {
  const directory = mkdtempSync(join(tmpdir(), "mercury-dev-secret-"))
  const environment = { NEON_AUTH_COOKIE_SECRET: "process-secret" }
  try {
    mkdirSync(join(directory, "apps/web"), { recursive: true })
    assert.equal(
      loadDevelopmentEnvironment(directory, environment)
        .NEON_AUTH_COOKIE_SECRET,
      "process-secret"
    )
    writeFileSync(
      join(directory, "apps/web/.dev.vars"),
      "NEON_AUTH_COOKIE_SECRET=\n"
    )
    assert.equal(
      loadDevelopmentEnvironment(directory, environment)
        .NEON_AUTH_COOKIE_SECRET,
      ""
    )
    writeFileSync(
      join(directory, "apps/web/.dev.vars"),
      "NEON_AUTH_COOKIE_SECRET=file-secret\n"
    )
    writeFileSync(
      join(directory, "apps/web/.dev.vars.development"),
      "NEON_AUTH_COOKIE_SECRET=mode-secret\n"
    )
    assert.equal(
      loadDevelopmentEnvironment(directory, environment)
        .NEON_AUTH_COOKIE_SECRET,
      "mode-secret"
    )
  } finally {
    rmSync(directory, { recursive: true })
  }
})

test("missing development configuration fails without exposing credentials", () => {
  assert.throws(
    () => validateDevelopment({ DATABASE_URL: databaseUrl }),
    (error) =>
      error.message.includes("Configure your Neon development branch") &&
      !error.message.includes("private-password")
  )
})

test("blank copied examples report setup fields instead of an Invalid URL exception", () => {
  assert.throws(
    () =>
      validateDevelopment({
        DATABASE_URL: "",
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: "",
        NEON_AUTH_BASE_URL: "",
        NEON_AUTH_COOKIE_SECRET: "",
        APP_ORIGIN: "http://localhost:5173",
      }),
    (error) =>
      error.message.includes("Configure your Neon development branch") &&
      error.message.includes("NEON_AUTH_BASE_URL") &&
      !error.message.includes("Invalid URL")
  )
})

test("development requires its own valid Auth URL and a long cookie secret", () => {
  const environment = {
    DATABASE_URL: databaseUrl,
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
    NEON_AUTH_BASE_URL: "https://auth.example.test/neondb/auth",
    NEON_AUTH_COOKIE_SECRET: "fixture-secret-of-at-least-32-characters",
    APP_ORIGIN: "http://localhost:5173",
  }
  validateDevelopment(environment)
  environment.NEON_AUTH_COOKIE_SECRET = "short-secret"
  assert.throws(
    () => validateDevelopment(environment),
    (error) =>
      error.message.includes("NEON_AUTH_COOKIE_SECRET") &&
      !error.message.includes("short-secret")
  )
  environment.NEON_AUTH_COOKIE_SECRET =
    "fixture-secret-of-at-least-32-characters"
  environment.NEON_AUTH_BASE_URL =
    "https://password:private@auth.example.test/neondb/auth"
  assert.throws(() => validateDevelopment(environment), /NEON_AUTH_BASE_URL/)
})

test("deployment rejects malformed Neon Auth URLs and placeholder Hyperdrive IDs", () => {
  const environment = {
    DATABASE_URL: databaseUrl,
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    HYPERDRIVE_ID: "0".repeat(32),
    NEON_AUTH_BASE_URL: "http://auth.example.test/neondb/auth",
    APP_ORIGIN: "https://app.example.test",
    CLOUDFLARE_CUSTOM_DOMAIN: "app.example.test",
  }
  assert.throws(
    () => validateDeployment(environment, "production"),
    /HYPERDRIVE_ID/
  )
  environment.HYPERDRIVE_ID = "b".repeat(32)
  assert.throws(
    () => validateDeployment(environment, "production"),
    /NEON_AUTH_BASE_URL/
  )
  environment.NEON_AUTH_BASE_URL = "https://auth.example.test/neondb/auth"
  assert.equal(
    validateDeployment(environment, "production").APP_ORIGIN,
    environment.APP_ORIGIN
  )
  environment.CLOUDFLARE_CUSTOM_DOMAIN = "another.example.test"
  assert.throws(
    () => validateDeployment(environment, "production"),
    /CLOUDFLARE_CUSTOM_DOMAIN/
  )
  environment.CLOUDFLARE_CUSTOM_DOMAIN = "app.example.test"
  environment.APP_ORIGIN = "https://app.example.test/"
  assert.throws(
    () => validateDeployment(environment, "production"),
    /APP_ORIGIN/
  )
})

test("migration configuration rejects Neon pooler endpoints", () => {
  const environment = {
    DATABASE_URL:
      "postgresql://migrator:private-password@ep-example-pooler.neon.tech/app",
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
    NEON_AUTH_BASE_URL: "http://auth.example.test/neondb/auth",
    NEON_AUTH_COOKIE_SECRET: "fixture-secret-of-at-least-32-characters",
    APP_ORIGIN: "http://localhost:5173",
  }
  assert.throws(() => validateDevelopment(environment), /DATABASE_URL/)
})

test("a same-mode artifact with different bindings cannot be deployed", () => {
  const directory = mkdtempSync(join(tmpdir(), "mercury-build-"))
  const environment = {
    HYPERDRIVE_ID: "a".repeat(32),
    APP_ORIGIN: "https://app.example.test",
    NEON_AUTH_BASE_URL: "https://auth.example.test/neondb/auth",
    CLOUDFLARE_CUSTOM_DOMAIN: "app.example.test",
  }
  try {
    mkdirSync(join(directory, "workers/default"), { recursive: true })
    writeFileSync(
      join(directory, "config.json"),
      JSON.stringify({ buildContext: { mode: "production", isPreview: false } })
    )
    const worker = {
      name: "app-production",
      domains: [environment.CLOUDFLARE_CUSTOM_DOMAIN],
      workersDev: false,
      env: {
        HYPERDRIVE: { id: environment.HYPERDRIVE_ID },
        APP_ORIGIN: { value: environment.APP_ORIGIN },
        NEON_AUTH_BASE_URL: {
          value: environment.NEON_AUTH_BASE_URL,
        },
      },
    }
    const workerFile = join(directory, "workers/default/worker.config.json")
    writeFileSync(workerFile, JSON.stringify(worker))
    validateBuildTarget(directory, "production", environment)
    worker.env.HYPERDRIVE.id = "b".repeat(32)
    writeFileSync(workerFile, JSON.stringify(worker))
    assert.throws(
      () => validateBuildTarget(directory, "production", environment),
      /Rebuild/
    )
    worker.env.HYPERDRIVE.id = environment.HYPERDRIVE_ID
    worker.env.NEON_AUTH_BASE_URL.value =
      "https://another-branch.example.test/neondb/auth"
    writeFileSync(workerFile, JSON.stringify(worker))
    assert.throws(
      () => validateBuildTarget(directory, "production", environment),
      /Rebuild/
    )
    assert.throws(
      () => validateBuildTarget(directory, "staging", environment),
      /Rebuild/
    )
  } finally {
    rmSync(directory, { recursive: true })
  }
})
