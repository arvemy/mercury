import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { createTestBranch, integrationConfig } from "./neon-test-branch.mjs"

const config = {
  apiKey: "secret-api-key",
  projectId: "project-test",
  parentId: "br-parent",
  database: "neondb",
  role: "neondb_owner",
}
const branchId = "br-owned-test"
const databaseUrl = "postgresql://user:secret-password@db.example.test/neondb"
const branchRoute = `/branches/${branchId}`
const created = (operations = []) => ({ branch: { id: branchId }, operations })
const operation = (id, status) => ({ id, status })

async function fixture(t, steps) {
  const evidenceDir = await mkdtemp(path.join(tmpdir(), "mercury-neon-test-"))
  t.after(() => rm(evidenceDir, { recursive: true, force: true }))
  let index = 0
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const step = steps[index++]
    assert.ok(step, `Unexpected request: ${options.method ?? "GET"} ${input}`)
    const url = new URL(input)
    assert.equal(url.origin, "https://console.neon.tech")
    assert.equal(
      url.pathname,
      `/api/v2/projects/${config.projectId}${step.route}`
    )
    assert.equal(options.method ?? "GET", step.method ?? "GET")
    assert.equal(options.headers.Authorization, `Bearer ${config.apiKey}`)
    if (step.inspect) await step.inspect({ url, options, evidenceDir })
    if (step.error) throw step.error
    const status = step.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(step.body), {
      status,
    })
  })
  t.after(() =>
    assert.equal(index, steps.length, "All expected requests occurred")
  )
  return evidenceDir
}

const post = (operations = []) => ({
  method: "POST",
  route: "/branches",
  body: created(operations),
})
const connection = { route: "/connection_uri", body: { uri: databaseUrl } }
const authBaseUrl =
  "https://ep-owned.neonauth.us-east-1.aws.neon.tech/neondb/auth"
const auth = {
  branch_id: branchId,
  db_name: config.database,
  auth_provider: "better_auth",
  base_url: authBaseUrl,
}
const email = {
  enabled: true,
  require_email_verification: false,
  disable_sign_up: false,
}
const authRead = { route: `${branchRoute}/auth`, body: auth }
const emailWrite = {
  method: "PATCH",
  route: `${branchRoute}/auth/email_and_password`,
  body: email,
  inspect: ({ options }) =>
    assert.deepEqual(JSON.parse(options.body), {
      enabled: true,
      require_email_verification: false,
    }),
}
const emailRead = {
  route: `${branchRoute}/auth/email_and_password`,
  body: email,
}
const authSteps = [authRead, emailWrite, emailRead]
const ready = [connection, ...authSteps]
const absent = (status = 204) => ({
  method: "DELETE",
  route: branchRoute,
  status,
})

test("waits for branch and compute creation before exposing a direct connection, and for deletion before evidence", async (t) => {
  const evidenceDir = await fixture(t, [
    {
      ...post([
        operation("create", "scheduling"),
        operation("compute", "running"),
        operation("skipped", "skipped"),
      ]),
      inspect: ({ options }) => {
        const body = JSON.parse(options.body)
        assert.equal(body.branch.parent_id, config.parentId)
        assert.match(body.branch.name, /^mercury-test-/)
        assert.equal(Object.hasOwn(body.branch, "expires_at"), false)
        assert.deepEqual(body.endpoints, [{ type: "read_write" }])
      },
    },
    {
      route: "/operations/create",
      body: { operation: operation("create", "finished") },
    },
    {
      route: "/operations/compute",
      body: { operation: operation("compute", "finished") },
    },
    {
      ...connection,
      inspect: ({ url }) =>
        assert.deepEqual(Object.fromEntries(url.searchParams), {
          branch_id: branchId,
          database_name: config.database,
          role_name: config.role,
          pooled: "false",
        }),
    },
    ...authSteps,
    {
      method: "DELETE",
      route: branchRoute,
      body: { operations: [operation("delete", "running")] },
    },
    {
      route: "/operations/delete",
      body: { operation: operation("delete", "finished") },
      inspect: ({ evidenceDir }) =>
        assert.equal(
          existsSync(path.join(evidenceDir, "neon-cleanup.txt")),
          false
        ),
    },
  ])
  const branch = await createTestBranch({ config, evidenceDir })
  assert.equal(branch.databaseUrl, databaseUrl)
  assert.equal(branch.branchId, branchId)
  assert.equal(branch.authBaseUrl, authBaseUrl)
  await branch.cleanup()
  assert.match(
    await readFile(path.join(evidenceDir, "neon-cleanup.txt"), "utf8"),
    /Deleted owned test branch br-owned-test/
  )
  const evidence = await readFile(
    path.join(evidenceDir, "neon-branch.json"),
    "utf8"
  )
  assert.equal(JSON.parse(evidence).branchId, branchId)
  assert.equal(evidence.includes("secret"), false)
})

test("cleanup converges when repeated DELETE returns 204 or 404", async (t) => {
  const evidenceDir = await fixture(t, [
    post(),
    ...ready,
    absent(),
    absent(404),
    absent(),
  ])
  const branch = await createTestBranch({ config, evidenceDir })
  await branch.cleanup()
  await branch.cleanup()
  await branch.cleanup()
  assert.ok(existsSync(path.join(evidenceDir, "neon-cleanup.txt")))
})

for (const status of ["failed", "error", "cancelled"]) {
  test(`a ${status} creation operation deletes its owned branch without exposing operation errors`, async (t) => {
    const evidenceDir = await fixture(t, [
      post([operation("create", "running")]),
      {
        route: "/operations/create",
        body: {
          operation: { ...operation("create", status), error: databaseUrl },
        },
      },
      absent(),
    ])
    await assert.rejects(createTestBranch({ config, evidenceDir }), (error) => {
      assert.match(error.message, new RegExp(status))
      assert.equal(error.message.includes("secret"), false)
      return true
    })
    assert.ok(existsSync(path.join(evidenceDir, "neon-cleanup.txt")))
  })
}

test("a failed deletion operation never records completed cleanup", async (t) => {
  const evidenceDir = await fixture(t, [
    post(),
    ...ready,
    {
      method: "DELETE",
      route: branchRoute,
      body: { operations: [operation("delete", "running")] },
    },
    {
      route: "/operations/delete",
      body: { operation: operation("delete", "failed") },
    },
  ])
  const branch = await createTestBranch({ config, evidenceDir })
  await assert.rejects(branch.cleanup(), /operation failed/)
  assert.equal(existsSync(path.join(evidenceDir, "neon-cleanup.txt")), false)
})

for (const failure of ["directory", "file"]) {
  test(`cleans up an owned branch when ${failure} evidence cannot be written`, async (t) => {
    const evidenceDir = await fixture(t, [post(), absent()])
    let destination = evidenceDir
    if (failure === "directory") {
      destination = path.join(evidenceDir, "not-a-directory")
      await writeFile(destination, "occupied")
    } else {
      await mkdir(path.join(evidenceDir, "neon-branch.json"))
    }
    await assert.rejects(createTestBranch({ config, evidenceDir: destination }))
  })
}

for (const returnedId of [config.parentId, "", undefined]) {
  test(`never deletes an unowned branch ID ${String(returnedId)}`, async (t) => {
    const evidenceDir = await fixture(t, [
      { ...post(), body: { branch: { id: returnedId }, operations: [] } },
    ])
    await assert.rejects(
      createTestBranch({ config, evidenceDir }),
      /new test branch ID/
    )
  })
}

test("readiness deadline triggers cleanup using a fresh deletion deadline", async (t) => {
  let now = Date.now()
  t.mock.method(Date, "now", () => now)
  const evidenceDir = await fixture(t, [
    post([operation("create", "running")]),
    {
      route: "/operations/create",
      body: { operation: operation("create", "running") },
      inspect: () => {
        now += 120_001
      },
    },
    absent(),
  ])
  await assert.rejects(createTestBranch({ config, evidenceDir }), /Timed out/)
  assert.ok(existsSync(path.join(evidenceDir, "neon-cleanup.txt")))
})

test("connection failure cleans up and excludes network error credentials", async (t) => {
  const evidenceDir = await fixture(t, [
    post(),
    { ...connection, error: new Error(databaseUrl) },
    absent(),
  ])
  await assert.rejects(createTestBranch({ config, evidenceDir }), (error) => {
    assert.match(error.message, /Neon API request failed/)
    assert.equal(error.message.includes("secret"), false)
    return true
  })
})

test("live configuration requires exactly the three Neon values and keeps database defaults", () => {
  assert.throws(
    () => integrationConfig({}),
    /NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID/
  )
  const result = integrationConfig({
    NEON_API_KEY: config.apiKey,
    NEON_PROJECT_ID: config.projectId,
    NEON_BRANCH_ID: config.parentId,
  })
  assert.deepEqual(result, config)
})

test("enables Auth only after the owned child's Auth GET returns 404 and reads its URL back", async (t) => {
  const evidenceDir = await fixture(t, [
    post(),
    connection,
    { ...authRead, status: 404, body: { message: "Not found" } },
    {
      method: "POST",
      route: `${branchRoute}/auth`,
      status: 201,
      body: {
        base_url: "https://ignored.example.test/auth",
        secret_server_key: "secret-server-key",
      },
      inspect: ({ options }) =>
        assert.deepEqual(JSON.parse(options.body), {
          auth_provider: "better_auth",
          database_name: config.database,
        }),
    },
    ...authSteps,
    absent(),
  ])
  const branch = await createTestBranch({ config, evidenceDir })
  assert.equal(branch.authBaseUrl, authBaseUrl)
  await branch.cleanup()
  assert.equal(
    (await readFile(path.join(evidenceDir, "neon-auth.json"), "utf8")).includes(
      "secret"
    ),
    false
  )
})

for (const status of [401, 403, 500]) {
  test(`Auth HTTP ${status} fails closed and deletes only the owned child`, async (t) => {
    const evidenceDir = await fixture(t, [
      post(),
      connection,
      { ...authRead, status, body: { message: databaseUrl } },
      absent(),
    ])
    await assert.rejects(createTestBranch({ config, evidenceDir }), (error) => {
      assert.match(error.message, new RegExp(`HTTP ${status}`))
      assert.equal(error.message.includes("secret"), false)
      return true
    })
  })
}

test("a failed Auth enable cleans up the owned branch", async (t) => {
  const evidenceDir = await fixture(t, [
    post(),
    connection,
    { ...authRead, status: 404 },
    { method: "POST", route: `${branchRoute}/auth`, status: 403 },
    absent(),
  ])
  await assert.rejects(createTestBranch({ config, evidenceDir }), /HTTP 403/)
})

for (const invalidAuth of [
  { ...auth, branch_id: config.parentId },
  { ...auth, db_name: "wrong" },
  { ...auth, auth_provider: "stack" },
  { ...auth, base_url: "http://wrong.example.test/auth" },
  { ...auth, base_url: undefined },
]) {
  test(`invalid child Auth configuration is rejected and cleaned up: ${JSON.stringify(invalidAuth)}`, async (t) => {
    const evidenceDir = await fixture(t, [
      post(),
      connection,
      { ...authRead, body: invalidAuth },
      absent(),
    ])
    await assert.rejects(
      createTestBranch({ config, evidenceDir }),
      /Auth (configuration|URL)/
    )
  })
}

test("email configuration must be confirmed on the child before exposing credentials", async (t) => {
  const evidenceDir = await fixture(t, [
    post(),
    connection,
    authRead,
    emailWrite,
    { ...emailRead, body: { ...email, require_email_verification: true } },
    absent(),
  ])
  await assert.rejects(
    createTestBranch({ config, evidenceDir }),
    /did not apply/
  )
})

test("trusts the exact owned Worker origin on the child and converges without duplicate writes", async (t) => {
  const origin = "http://127.0.0.1:49123"
  const domains = {
    route: `${branchRoute}/auth/domains`,
    body: { domains: [{ domain: origin, auth_provider: "better_auth" }] },
  }
  const evidenceDir = await fixture(t, [
    post(),
    ...ready,
    { ...domains, body: { domains: [] } },
    {
      method: "POST",
      route: domains.route,
      status: 201,
      inspect: ({ options }) =>
        assert.deepEqual(JSON.parse(options.body), {
          domain: origin,
          auth_provider: "better_auth",
        }),
    },
    domains,
    domains,
    absent(),
  ])
  const branch = await createTestBranch({ config, evidenceDir })
  for (const invalid of [
    "https://example.test",
    `${origin}/path`,
    `${origin}?query=1`,
    `${origin}#hash`,
    "http://user:password@127.0.0.1:49123",
  ])
    await assert.rejects(branch.trustOrigin(invalid), /only the owned/)
  await branch.trustOrigin(origin)
  await branch.trustOrigin(origin)
  await branch.cleanup()
})

test("CI evidence excludes environment files and screenshots and redacts credentials", async (t) => {
  const { sanitizeIntegrationEvidence } = await import("./integration.mjs")
  const root = await mkdtemp(path.join(tmpdir(), "mercury-evidence-test-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceDir = path.join(root, "source")
  const run = path.join(sourceDir, "integration-123", "browser")
  const outputDir = path.join(root, "output")
  await mkdir(run, { recursive: true })
  await writeFile(
    path.join(run, "network.log"),
    `${config.apiKey}\n${encodeURIComponent(config.apiKey)}\n${databaseUrl}\nNEON_AUTH_COOKIE_SECRET=random-secret\nCookie: session=secret-session\nBearer secret-bearer\neyJsecret.eyJpayload.secret-signature\n`
  )
  await writeFile(path.join(run, ".env"), "must not copy")
  await writeFile(path.join(run, "state.png"), "must not copy")
  await writeFile(
    path.join(run, "neon-auth-users.json"),
    JSON.stringify([{ id: "nonsecret-user-id" }])
  )
  await sanitizeIntegrationEvidence({
    sourceDir,
    outputDir,
    env: { NEON_API_KEY: config.apiKey },
  })
  const copied = path.join(outputDir, "integration-123", "browser")
  const log = await readFile(path.join(copied, "network.log"), "utf8")
  for (const secret of [
    config.apiKey,
    "secret-password",
    "random-secret",
    "secret-session",
    "secret-bearer",
    "secret-signature",
  ])
    assert.equal(log.includes(secret), false)
  assert.equal(existsSync(path.join(copied, ".env")), false)
  assert.equal(existsSync(path.join(copied, "state.png")), false)
  assert.match(
    await readFile(path.join(copied, "neon-auth-users.json"), "utf8"),
    /nonsecret-user-id/
  )
})

test("an owned workers.dev origin requires the caller's exact remote ownership proof", async (t) => {
  const origin = "https://mercury-proof.owned-account.workers.dev"
  const domains = {
    route: `${branchRoute}/auth/domains`,
    body: { domains: [{ domain: origin, auth_provider: "better_auth" }] },
  }
  const evidenceDir = await fixture(t, [post(), ...ready, domains, absent()])
  const branch = await createTestBranch({ config, evidenceDir })
  await assert.rejects(branch.trustOrigin(origin), /only the owned/)
  await branch.trustOrigin(origin, { remoteOrigin: origin })
  assert.equal(
    JSON.parse(
      await readFile(path.join(evidenceDir, "neon-auth-origin.json"), "utf8")
    ).origin,
    origin
  )
  await branch.cleanup()
})

test("remote origin proof cannot authorize a different host, arbitrary domain, or malformed worker labels", async (t) => {
  const evidenceDir = await fixture(t, [post(), ...ready, absent()])
  const branch = await createTestBranch({ config, evidenceDir })
  await assert.rejects(
    branch.trustOrigin("https://other.owned-account.workers.dev", {
      remoteOrigin: "https://owned.owned-account.workers.dev",
    }),
    /only the owned/
  )
  for (const origin of [
    "https://example.test",
    "https://workers.dev",
    "https://account.workers.dev",
    "https://-worker.account.workers.dev",
    "https://worker.-account.workers.dev",
    "http://worker.account.workers.dev",
  ])
    await assert.rejects(
      branch.trustOrigin(origin, { remoteOrigin: origin }),
      /only the owned/
    )
  await branch.cleanup()
})

test("remote ownership proof rejects credentials and non-origin URLs", async (t) => {
  const evidenceDir = await fixture(t, [post(), ...ready, absent()])
  const branch = await createTestBranch({ config, evidenceDir })
  for (const origin of [
    "https://user:password@worker.account.workers.dev",
    "https://worker.account.workers.dev/path",
    "https://worker.account.workers.dev?query=1",
    "https://worker.account.workers.dev#hash",
  ])
    await assert.rejects(
      branch.trustOrigin(origin, { remoteOrigin: origin }),
      /only the owned/
    )
  await branch.cleanup()
})
