import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  assertNoCredentials,
  cloudflareNotFound,
  deployedConfig,
  deploymentEnvironment,
  prepareDeployedWorker,
  redactEvidence,
} from "./verify-deployed.mjs"

const target = {
  name: "mercury-verify-2d50f015-21e7-4915-bc4e-aec3b581e425",
  origin:
    "https://mercury-verify-2d50f015-21e7-4915-bc4e-aec3b581e425.example.workers.dev",
  hyperdriveId: "1234567890abcdef1234567890abcdef",
  authBaseUrl: "https://example.neonauth.neon.tech/neondb/auth",
}
const context = { buildContext: { mode: "production", isPreview: false } }
function starterWorker() {
  return {
    name: "mercury-production",
    compatibilityDate: "2026-10-16",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/api", "/api/*"],
    },
    observability: { enabled: true, traces: { enabled: true } },
    domains: ["existing.example.com"],
    workersDev: false,
    manifest: { mainModule: "index.js" },
    env: {
      HYPERDRIVE: {
        type: "hyperdrive",
        id: "00000000000000000000000000000000",
        dev: { connectionString: "postgres://local:local@127.0.0.1/local" },
      },
      APP_ORIGIN: { type: "text", value: "http://localhost:5173" },
      NEON_AUTH_BASE_URL: { type: "text", value: "" },
      NEON_AUTH_COOKIE_SECRET: { type: "secret" },
    },
  }
}

test("deployment accepts only one existing workers.dev account label and a valid account ID", () => {
  const env = {
    CLOUDFLARE_ACCOUNT_ID: target.hyperdriveId,
    WORKERS_DEV_SUBDOMAIN: "account-name.workers.dev",
  }
  assert.deepEqual(deployedConfig(env), {
    accountId: target.hyperdriveId,
    subdomain: "account-name",
  })
  for (const subdomain of [
    "",
    "-account",
    "account-",
    "account.other",
    "https://account.workers.dev",
    "*.workers.dev",
    "a".repeat(64),
  ]) {
    assert.throws(() =>
      deployedConfig({ ...env, WORKERS_DEV_SUBDOMAIN: subdomain })
    )
  }
  assert.throws(() =>
    deployedConfig({ ...env, CLOUDFLARE_ACCOUNT_ID: "account" })
  )
})

test("build environment excludes credentials and injected Node/build configuration", () => {
  const env = {
    PATH: "/bin",
    HOME: "/test",
    DATABASE_URL: "owner",
    DATABASE_URL_UNPOOLED: "owner-direct",
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: "runtime",
    NEON_AUTH_COOKIE_SECRET: "cookie",
    NEON_API_KEY: "neon",
    CLOUDFLARE_API_TOKEN: "cloudflare",
    NODE_OPTIONS: "--require /secret.js",
    VITE_PRIVATE_KEY: "private",
    CLOUDFLARE_CUSTOM_DOMAIN: "production.example.com",
  }
  const build = deploymentEnvironment(env)
  assert.equal(build.PATH, "/bin")
  assert.equal(build.HOME, "/test")
  for (const key of Object.keys(env).filter(
    (key) => !["PATH", "HOME"].includes(key)
  ))
    assert.equal(build[key], undefined, key)
})

test("prebuilt Worker uses only owned remote bindings and retains application deployment semantics", () => {
  const original = starterWorker()
  const configured = prepareDeployedWorker(context, original, target)
  assert.equal(configured.name, target.name)
  assert.equal(configured.workersDev, true)
  assert.deepEqual(configured.domains, [])
  assert.deepEqual(configured.env, {
    HYPERDRIVE: { type: "hyperdrive", id: target.hyperdriveId },
    APP_ORIGIN: { type: "text", value: target.origin },
    NEON_AUTH_BASE_URL: { type: "text", value: target.authBaseUrl },
    NEON_AUTH_COOKIE_SECRET: { type: "secret" },
  })
  for (const key of [
    "compatibilityDate",
    "compatibilityFlags",
    "assets",
    "observability",
    "manifest",
  ])
    assert.deepEqual(configured[key], original[key])
  assert.ok(
    original.env.HYPERDRIVE.dev,
    "Does not mutate the original artifact"
  )
  assert.equal(
    prepareDeployedWorker(
      context,
      { ...original, name: "generated-app-production" },
      target
    ).name,
    target.name
  )
  assert.throws(() =>
    prepareDeployedWorker(
      { buildContext: { mode: "staging", isPreview: false } },
      original,
      target
    )
  )
  assert.throws(() =>
    prepareDeployedWorker(
      { buildContext: { mode: "production", isPreview: true } },
      original,
      target
    )
  )
  assert.throws(() =>
    prepareDeployedWorker(
      context,
      { ...original, name: "some-existing-worker" },
      target
    )
  )
  assert.throws(() =>
    prepareDeployedWorker(context, original, {
      ...target,
      origin: "https://existing.example.com",
    })
  )
  assert.throws(() =>
    prepareDeployedWorker(
      context,
      {
        ...original,
        env: {
          ...original.env,
          DATABASE_URL: { type: "text", value: "owner" },
        },
      },
      target
    )
  )
})

test("not-found evidence rejects authorization, network, and successful-but-empty responses", () => {
  const absent = {
    code: 1,
    stdout: "",
    stderr:
      "\n┌ APIError\n│ [10007] This Worker does not exist on your account.\n│ 404 Not Found · HTTP /accounts/example/workers/workers/owned\n└\n",
  }
  assert.equal(cloudflareNotFound(absent), true)
  assert.equal(
    cloudflareNotFound({
      code: 1,
      stdout: JSON.stringify({ httpStatus: 404 }),
      stderr: "",
    }),
    true
  )
  for (const response of [
    { code: 0, stdout: "{}", stderr: "" },
    { code: 1, stdout: "", stderr: "APIError 403 Forbidden" },
    { code: 1, stdout: "", stderr: "fetch failed" },
    { code: 1, stdout: "", stderr: "APIError [10007] could not verify" },
    { code: 1, stdout: "", stderr: "404 Not Found in a build log" },
  ])
    assert.equal(cloudflareNotFound(response), false)
})

test("artifact scan catches credentials in nested code and encoded credentials without revealing them", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mercury-artifact-test-"))
  const secret = "secret/value+with symbols"
  try {
    await mkdir(path.join(dir, "nested"))
    const output = path.join(dir, "nested", "index.js")
    await writeFile(
      output,
      'export default { fetch: () => new Response("ok") }'
    )
    await assertNoCredentials(dir, [secret])
    for (const text of [
      secret,
      encodeURIComponent(secret),
      "postgres://owner:password@example.com/neondb",
    ]) {
      await writeFile(output, text)
      await assert.rejects(assertNoCredentials(dir, [secret]), (error) => {
        assert.doesNotMatch(error.message, /secret\/value|owner:password/)
        return true
      })
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("CLI evidence removes generated passwords, database URLs, bearer credentials, and encoded values", () => {
  const output = redactEvidence(
    "password=abc/def encoded=abc%2Fdef postgres://owner:password@example.com/neondb Bearer private-token",
    ["abc/def"]
  )
  assert.doesNotMatch(output, /abc|owner:password|private-token/)
  assert.match(output, /\[redacted\]/)
})
