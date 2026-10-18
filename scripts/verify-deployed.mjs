import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { integrationConfig, createTestBranch } from "./neon-test-branch.mjs"
import { verifyHttpWorker } from "./verify-worker.mjs"

const identifier = /^[a-f\d]{32}$/i
const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function deployedConfig(env = process.env) {
  assert.match(
    env.CLOUDFLARE_ACCOUNT_ID ?? "",
    identifier,
    "Set CLOUDFLARE_ACCOUNT_ID to the verification account ID"
  )
  const subdomain = env.WORKERS_DEV_SUBDOMAIN?.replace(/\.workers\.dev$/, "")
  assert.match(
    subdomain ?? "",
    label,
    "Set WORKERS_DEV_SUBDOMAIN to the account's existing workers.dev subdomain"
  )
  return { accountId: env.CLOUDFLARE_ACCOUNT_ID, subdomain }
}

export function deploymentEnvironment(env = process.env) {
  const keys = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "PNPM_HOME",
    "COREPACK_HOME",
    "LANG",
    "LC_ALL",
  ]
  return {
    ...Object.fromEntries(
      keys.filter((key) => env[key] !== undefined).map((key) => [key, env[key]])
    ),
    NO_COLOR: "1",
    CI: "1",
    WRANGLER_SEND_METRICS: "false",
    TURBO_TELEMETRY_DISABLED: "1",
  }
}

export function redactEvidence(text, secrets) {
  for (const secret of secrets.filter(Boolean)) {
    for (const value of [secret, encodeURIComponent(secret)])
      text = text.replaceAll(value, "[redacted]")
  }
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database URI]")
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [redacted]")
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[redacted token]"
    )
}

export function cloudflareNotFound({ code, stdout, stderr }) {
  if (code === 0) return false
  for (const output of [stdout, stderr]) {
    try {
      const error = JSON.parse(output)
      if (
        error.httpStatus === 404 ||
        error.status === 404 ||
        error.statusCode === 404
      )
        return true
    } catch {
      // cf beta.17 renders API errors as text, even when stdout is JSON.
    }
  }
  return /APIError/.test(stderr) && /\b404 Not Found\b/.test(stderr)
}

export function prepareDeployedWorker(context, worker, target) {
  assert.equal(
    context.buildContext?.mode,
    "production",
    "Deploy only the production artifact"
  )
  assert.equal(
    context.buildContext?.isPreview,
    false,
    "Do not deploy a preview artifact"
  )
  assert.match(
    worker.name,
    /^[a-z0-9][a-z0-9-]*-production$/,
    "Expected the app's production Worker"
  )
  assert.equal(worker.env?.HYPERDRIVE?.type, "hyperdrive")
  assert.equal(worker.env?.NEON_AUTH_COOKIE_SECRET?.type, "secret")
  assert.deepEqual(Object.keys(worker.env).sort(), [
    "APP_ORIGIN",
    "HYPERDRIVE",
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
  ])
  assert.match(target.name, /^mercury-verify-[\da-f-]{36}$/)
  assert.match(target.hyperdriveId, identifier)
  assert.match(
    target.origin,
    /^https:\/\/mercury-verify-[\da-f-]{36}\.[a-z0-9-]+\.workers\.dev$/
  )
  assert.equal(new URL(target.origin).hostname.split(".")[0], target.name)
  const auth = new URL(target.authBaseUrl)
  assert.equal(auth.protocol, "https:")
  assert.equal(auth.username + auth.password + auth.search + auth.hash, "")
  assert.ok(auth.pathname.endsWith("/auth"))
  return {
    ...worker,
    name: target.name,
    workersDev: true,
    domains: [],
    env: {
      HYPERDRIVE: { type: "hyperdrive", id: target.hyperdriveId },
      APP_ORIGIN: { type: "text", value: target.origin },
      NEON_AUTH_BASE_URL: { type: "text", value: target.authBaseUrl },
      NEON_AUTH_COOKIE_SECRET: { type: "secret" },
    },
  }
}

export async function assertNoCredentials(directory, secrets) {
  const needles = secrets
    .filter(Boolean)
    .flatMap((secret) => [secret, encodeURIComponent(secret)])
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await assertNoCredentials(file, secrets)
    else if (entry.isFile()) {
      const content = await readFile(file)
      assert.ok(
        !needles.some((secret) => content.includes(Buffer.from(secret))),
        `Credential found in generated artifact ${file}`
      )
      assert.ok(
        !/postgres(?:ql)?:\/\/[^:\s/"'<>]+:[^@\s"'<>]+@/i.test(
          content.toString()
        ),
        `Database credentials found in generated artifact ${file}`
      )
    } else throw new Error(`Unexpected non-file in build output: ${file}`)
  }
}

export async function verifyDeployed({
  cwd = process.cwd(),
  evidenceDir = path.resolve(".audit", `deployed-${Date.now()}`),
  env = process.env,
} = {}) {
  const config = deployedConfig(env)
  const neon = integrationConfig(env)
  const name = `mercury-verify-${randomUUID()}`
  const origin = `https://${name}.${config.subdomain}.workers.dev`
  const secrets = [
    neon.apiKey,
    env.CLOUDFLARE_API_TOKEN,
    env.NEON_AUTH_COOKIE_SECRET,
  ]
  const baseEnv = deploymentEnvironment(env)
  const cliEnv = {
    ...baseEnv,
    CLOUDFLARE_ACCOUNT_ID: config.accountId,
    ...(env.CLOUDFLARE_API_TOKEN
      ? { CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN }
      : {}),
  }
  const owned = {
    name,
    origin,
    accountId: config.accountId,
    workerAttempted: false,
    hyperdriveAttempted: false,
  }
  let scratch
  let privateDir
  let branch
  let hyperdriveBody
  const failures = []
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 })
  assert.deepEqual(
    await readdir(evidenceDir),
    [],
    "Use an empty evidence directory for each deployed verification"
  )
  const evidence = async (file, value) =>
    writeFile(
      path.join(evidenceDir, file),
      redactEvidence(
        typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2) + "\n",
        secrets
      ),
      { mode: 0o600 }
    )
  async function run(
    args,
    log,
    {
      directory = scratch ?? cwd,
      environment = cliEnv,
      allowFailure = false,
    } = {}
  ) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn("pnpm", args, {
        cwd: directory,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 300_000,
        killSignal: "SIGKILL",
      })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (chunk) => {
        stdout += chunk
      })
      child.stderr.on("data", (chunk) => {
        stderr += chunk
      })
      child.on("error", reject)
      child.on("close", (code) => resolve({ code, stdout, stderr }))
    })
    await evidence(`${log}.log`, result.stdout + result.stderr)
    if (result.code !== 0 && !allowFailure)
      throw new Error(
        `${log} failed with exit ${result.code}. See ${path.join(evidenceDir, `${log}.log`)}.`
      )
    return result
  }
  const cf = (args, log, options) =>
    run(["--dir", "apps/web", "exec", "cf", ...args], log, options)
  async function cfJson(args, log) {
    const result = await cf(args, log)
    try {
      return JSON.parse(result.stdout)
    } catch {
      throw new Error(`${log} returned invalid JSON.`)
    }
  }
  async function findHyperdrive(log) {
    for (let page = 1; page <= 100; page++) {
      const list = await cfJson(
        ["hyperdrive", "list", "--page", String(page), "--per-page", "100"],
        `${log}-${page}`
      )
      assert.ok(Array.isArray(list), "Hyperdrive list must be an array")
      const matches = list.filter((item) => item.name === name)
      assert.ok(matches.length < 2, "Hyperdrive name is ambiguous")
      if (matches.length) return matches[0]
      if (list.length < 100) return
    }
    throw new Error("Could not exhaust Hyperdrive inventory safely.")
  }
  try {
    const before = await cf(["workers", "get", name], "worker-before", {
      allowFailure: true,
    })
    assert.ok(
      cloudflareNotFound(before),
      "Worker ownership requires an explicit preflight 404"
    )
    assert.equal(
      await findHyperdrive("hyperdrive-before"),
      undefined,
      "The unique Hyperdrive name must not exist"
    )
    await evidence("owned-resources.json", owned)
    scratch = await mkdtemp(path.join(os.tmpdir(), "mercury-deployed-"))
    privateDir = await mkdtemp(
      path.join(os.tmpdir(), "mercury-deployed-secrets-")
    )
    const files = execFileSync("git", ["ls-files", "-z"], {
      cwd,
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean)
    for (const file of files) {
      if (/^(\.agents|\.claude|\.audit|\.github|cli|docs)\//.test(file))
        continue
      if (
        /(^|\/)\.(env|dev\.vars)(\.|$)/.test(file) &&
        !file.endsWith(".example")
      )
        continue
      const from = path.join(cwd, file)
      try {
        await access(from)
      } catch {
        continue
      }
      const to = path.join(scratch, file)
      await mkdir(path.dirname(to), { recursive: true })
      await copyFile(from, to)
    }
    for (const dir of ["", "apps/api", "apps/web", "packages/ui"]) {
      const modules = path.join(cwd, dir, "node_modules")
      try {
        await access(modules)
      } catch {
        continue
      }
      await symlink(modules, path.join(scratch, dir, "node_modules"), "dir")
    }
    branch = await createTestBranch({ config: neon, evidenceDir })
    owned.branchId = branch.branchId
    secrets.push(
      branch.databaseUrl,
      decodeURIComponent(new URL(branch.databaseUrl).password)
    )
    await evidence("owned-resources.json", owned)
    await run(["--filter", "@workspace/api", "db:migrate"], "migrate", {
      environment: { ...baseEnv, DATABASE_URL: branch.databaseUrl },
    })
    const direct = new URL(branch.databaseUrl)
    assert.ok(["postgres:", "postgresql:"].includes(direct.protocol))
    assert.ok(
      !direct.hostname.includes("-pooler"),
      "Hyperdrive requires the direct Neon endpoint"
    )
    assert.equal(direct.port || "5432", "5432")
    const runtimeRole = `mercury_runtime_${randomBytes(12).toString("hex")}`
    const runtimePassword = randomBytes(32).toString("base64url")
    secrets.push(runtimePassword)
    const require = createRequire(path.join(cwd, "apps/api/package.json"))
    const { Client } = require("pg")
    const owner = new Client({
      connectionString: branch.databaseUrl,
      connectionTimeoutMillis: 30_000,
      query_timeout: 30_000,
    })
    await owner.connect()
    try {
      assert.match(runtimeRole, /^mercury_runtime_[a-f\d]{24}$/)
      const role = `"${runtimeRole}"`
      const password = "'" + runtimePassword.replaceAll("'", "''") + "'"
      const database =
        '"' +
        decodeURIComponent(direct.pathname.slice(1)).replaceAll('"', '""') +
        '"'
      await owner.query(
        `CREATE ROLE ${role} LOGIN PASSWORD ${password} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`
      )
      await owner.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`)
      await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`)
      await owner.query(`GRANT SELECT, INSERT ON TABLE public.todos TO ${role}`)
      const { rows } = await owner.query(
        "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, pg_has_role(oid, 'neon_superuser', 'member') AS neon_superuser FROM pg_roles WHERE rolname = $1",
        [runtimeRole]
      )
      assert.deepEqual(rows, [
        {
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolreplication: false,
          rolbypassrls: false,
          neon_superuser: false,
        },
      ])
    } finally {
      await owner.end()
    }
    direct.username = runtimeRole
    direct.password = runtimePassword
    secrets.push(direct.href)
    const runtime = new Client({
      connectionString: direct.href,
      connectionTimeoutMillis: 30_000,
      query_timeout: 30_000,
    })
    await runtime.connect()
    try {
      const { rows } = await runtime.query(
        "SELECT has_table_privilege(current_user, 'public.todos', 'SELECT') AS can_select, has_table_privilege(current_user, 'public.todos', 'INSERT') AS can_insert, has_table_privilege(current_user, 'public.todos', 'UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS can_modify, has_schema_privilege(current_user, 'public', 'CREATE') AS can_create"
      )
      assert.deepEqual(rows, [
        {
          can_select: true,
          can_insert: true,
          can_modify: false,
          can_create: false,
        },
      ])
      await runtime.query("BEGIN")
      await assert.rejects(
        runtime.query(
          "ALTER TABLE public.todos ADD COLUMN forbidden_runtime_column text"
        ),
        { code: "42501" }
      )
    } finally {
      await runtime.query("ROLLBACK").finally(() => runtime.end())
    }
    await evidence("runtime-role.json", {
      role: runtimeRole,
      ownerPrivileges: false,
      alterTableDenied: "42501",
      grants: [
        "CONNECT",
        "USAGE public",
        "SELECT public.todos",
        "INSERT public.todos",
      ],
    })
    hyperdriveBody = {
      name,
      origin: {
        scheme: "postgres",
        host: direct.hostname,
        port: 5432,
        database: decodeURIComponent(direct.pathname.slice(1)),
        user: runtimeRole,
        password: runtimePassword,
      },
      caching: { disabled: true },
      mtls: { sslmode: "require" },
      origin_connection_limit: 5,
    }
    const bodyFile = path.join(privateDir, "hyperdrive.json")
    await writeFile(bodyFile, JSON.stringify(hyperdriveBody), { mode: 0o600 })
    await cf(
      ["hyperdrive", "create", "--body", `@${bodyFile}`, "--dry-run"],
      "hyperdrive-plan"
    )
    owned.hyperdriveAttempted = true
    await evidence("owned-resources.json", owned)
    const created = await cfJson(
      ["hyperdrive", "create", "--body", `@${bodyFile}`],
      "hyperdrive-create"
    )
    assert.match(created.id, identifier)
    owned.hyperdriveId = created.id
    await evidence("owned-resources.json", owned)
    const hyperdrive = await cfJson(
      ["hyperdrive", "get", owned.hyperdriveId],
      "hyperdrive-readback"
    )
    assert.equal(hyperdrive.name, name)
    assert.equal(hyperdrive.caching?.disabled, true)
    assert.equal(hyperdrive.origin?.host, direct.hostname)
    assert.equal(hyperdrive.origin?.user, runtimeRole)
    assert.equal(hyperdrive.origin?.database, hyperdriveBody.origin.database)
    await branch.trustOrigin(origin, { remoteOrigin: origin })
    const buildEnv = {
      ...baseEnv,
      CLOUDFLARE_ACCOUNT_ID: config.accountId,
      HYPERDRIVE_ID: owned.hyperdriveId,
      APP_ORIGIN: origin,
      NEON_AUTH_BASE_URL: branch.authBaseUrl,
    }
    await run(["build"], "build", { environment: buildEnv })
    const output = path.join(scratch, "apps/web/.cloudflare/output/v0")
    assert.deepEqual(
      await readdir(path.join(output, "workers")),
      ["default"],
      "Deploy only the starter's single Worker"
    )
    const workerConfigPath = path.join(
      output,
      "workers/default/worker.config.json"
    )
    const context = JSON.parse(
      await readFile(path.join(output, "config.json"), "utf8")
    )
    const workerConfig = prepareDeployedWorker(
      context,
      JSON.parse(await readFile(workerConfigPath, "utf8")),
      {
        name,
        origin,
        hyperdriveId: owned.hyperdriveId,
        authBaseUrl: branch.authBaseUrl,
      }
    )
    await writeFile(workerConfigPath, JSON.stringify(workerConfig))
    await evidence("worker.config.json", workerConfig)
    const cookieSecret = randomBytes(32).toString("base64url")
    secrets.push(cookieSecret)
    await assertNoCredentials(output, secrets)
    const secretsFile = path.join(privateDir, "worker-secrets.json")
    await writeFile(
      secretsFile,
      JSON.stringify({ NEON_AUTH_COOKIE_SECRET: cookieSecret }),
      { mode: 0o600 }
    )
    const deploy = [
      "deploy",
      "--prebuilt",
      "--mode",
      "production",
      "--provision=false",
      "--secrets-file",
      secretsFile,
    ]
    await cf([...deploy, "--dry-run"], "deploy-plan")
    owned.workerAttempted = true
    await evidence("owned-resources.json", owned)
    await cf(deploy, "deploy")
    const worker = await cfJson(["workers", "get", name], "worker-readback")
    assert.equal(worker.name, name)
    assert.match(worker.id, identifier)
    owned.workerId = worker.id
    await evidence("owned-resources.json", owned)
    assert.equal(worker.subdomain?.enabled, true)
    assert.equal(worker.subdomain?.url, origin)
    assert.deepEqual(worker.references?.domains, [])
    const version = await cfJson(
      ["workers", "versions", "get", "latest", "--worker-id", worker.id],
      "worker-version"
    )
    assert.equal(version.env?.HYPERDRIVE?.type, "hyperdrive")
    assert.equal(version.env?.HYPERDRIVE?.id, owned.hyperdriveId)
    assert.equal(version.env?.NEON_AUTH_COOKIE_SECRET?.type, "secret_text")
    assert.equal(version.env?.APP_ORIGIN?.text, origin)
    assert.equal(version.env?.NEON_AUTH_BASE_URL?.text, branch.authBaseUrl)
    const workerSecrets = await cfJson(
      ["workers", "secrets", "list", "--worker", name],
      "worker-secrets"
    )
    assert.ok(
      workerSecrets.some(
        (secret) =>
          secret.name === "NEON_AUTH_COOKIE_SECRET" &&
          secret.type === "secret_text"
      )
    )
    const deadline = Date.now() + 120_000
    let ready = false
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${origin}/api/health`, {
          signal: AbortSignal.timeout(5000),
        })
        await response.arrayBuffer()
        if (response.status === 200) {
          ready = true
          break
        }
        if (response.status === 500)
          throw new Error("Deployed Worker returned HTTP 500 during readiness.")
      } catch (error) {
        if (
          error.message ===
          "Deployed Worker returned HTTP 500 during readiness."
        )
          throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    assert.ok(ready, "Deployed Worker must become ready within 120 seconds")
    await verifyHttpWorker({ url: origin, evidenceDir })
    const { verifyNeonAuth } = await import("./neon-auth-e2e.mjs")
    await verifyNeonAuth({
      url: origin,
      databaseUrl: branch.databaseUrl,
      evidenceDir: path.join(evidenceDir, "browser"),
      cwd,
    })
    await evidence("coverage.json", {
      origin,
      liveWorker: true,
      liveHyperdrive: true,
      customDomain:
        "unverified; this suite uses the existing workers.dev subdomain",
    })
  } catch (error) {
    failures.push(error)
  } finally {
    for (const { resource, cleanup } of [
      {
        resource: "worker",
        cleanup: async () => {
          if (!owned.workerAttempted) return
          const current = await cf(
            ["workers", "get", owned.workerId ?? name],
            "worker-cleanup-before",
            { allowFailure: true }
          )
          if (cloudflareNotFound(current)) return
          assert.equal(
            current.code,
            0,
            "Cannot establish owned Worker state for cleanup"
          )
          const worker = JSON.parse(current.stdout)
          assert.equal(worker.name, name)
          assert.match(worker.id, identifier)
          if (owned.workerId) assert.equal(worker.id, owned.workerId)
          owned.workerId = worker.id
          await evidence("owned-resources.json", owned)
          await cf(["workers", "delete", worker.id, "--force"], "worker-delete")
          assert.ok(
            cloudflareNotFound(
              await cf(["workers", "get", worker.id], "worker-deleted", {
                allowFailure: true,
              })
            ),
            "Worker deletion requires a readback 404"
          )
        },
      },
      {
        resource: "hyperdrive",
        cleanup: async () => {
          if (!owned.hyperdriveAttempted) return
          if (!owned.hyperdriveId) {
            const recovered = await findHyperdrive("hyperdrive-recover")
            if (!recovered) return
            assert.equal(recovered.origin?.host, hyperdriveBody.origin.host)
            assert.equal(recovered.origin?.user, hyperdriveBody.origin.user)
            assert.match(recovered.id, identifier)
            owned.hyperdriveId = recovered.id
            await evidence("owned-resources.json", owned)
          }
          await cf(
            ["hyperdrive", "delete", owned.hyperdriveId, "--force"],
            "hyperdrive-delete"
          )
          assert.ok(
            cloudflareNotFound(
              await cf(
                ["hyperdrive", "get", owned.hyperdriveId],
                "hyperdrive-deleted",
                { allowFailure: true }
              )
            ),
            "Hyperdrive deletion requires a readback 404"
          )
        },
      },
      {
        resource: "neon",
        cleanup: async () => {
          if (!branch) return
          await branch.cleanup()
          const response = await fetch(
            `https://console.neon.tech/api/v2/projects/${encodeURIComponent(neon.projectId)}/branches/${encodeURIComponent(branch.branchId)}`,
            {
              headers: { Authorization: `Bearer ${neon.apiKey}` },
              signal: AbortSignal.timeout(30_000),
            }
          )
          await response.arrayBuffer()
          assert.equal(
            response.status,
            404,
            "Neon deletion requires a readback 404"
          )
        },
      },
      {
        resource: "private files",
        cleanup: async () => {
          if (privateDir) await rm(privateDir, { recursive: true, force: true })
        },
      },
      {
        resource: "scratch",
        cleanup: async () => {
          if (scratch) await rm(scratch, { recursive: true, force: true })
        },
      },
    ]) {
      try {
        await cleanup()
        await evidence(`cleanup-${resource.replaceAll(" ", "-")}.json`, {
          completed: true,
        })
      } catch (error) {
        failures.push(
          new Error(
            `${resource} cleanup failed. ${redactEvidence(error.message, secrets)}`,
            { cause: error }
          )
        )
      }
    }
  }
  if (failures.length) {
    await evidence(
      "FAIL",
      failures
        .map((error) => redactEvidence(error.message, secrets))
        .join("\n") + "\n"
    )
    throw new AggregateError(
      failures,
      `Deployed verification failed. See ${evidenceDir}. ${failures.map((error) => redactEvidence(error.message, secrets)).join(" ")}`
    )
  }
  await evidence(
    "PASS",
    "Live Cloudflare Worker, Hyperdrive with a restricted runtime role, Neon Auth, HTTP routes and caching, two-user ownership, and verified cleanup passed. Custom-domain DNS/TLS remains unverified.\n"
  )
  console.log(`Deployed verification passed. Evidence is in ${evidenceDir}.`)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyDeployed().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
