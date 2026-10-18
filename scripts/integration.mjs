import { randomBytes } from "node:crypto"
import { execFileSync, spawn } from "node:child_process"
import {
  mkdir,
  mkdtemp,
  copyFile,
  writeFile,
  symlink,
  rm,
  access,
  readdir,
  readFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { integrationConfig, createTestBranch } from "./neon-test-branch.mjs"
import { startWorker } from "./verify-worker.mjs"

export async function sanitizeIntegrationEvidence({
  sourceDir = path.resolve(".audit"),
  outputDir,
  env = process.env,
}) {
  const secrets = [env.NEON_API_KEY, env.NEON_AUTH_COOKIE_SECRET]
    .filter(Boolean)
    .flatMap((value) => [value, encodeURIComponent(value)])
  const names =
    /^(PASS|neon-(?:branch|auth|auth-origin)\.json|neon-cleanup\.txt|migrate\.log|api-integration\.log|worker\.log|neon-auth-users\.json|checks\.log|network\.log|database\.json|[\w-]+\.aria\.txt)$/
  async function copyEvidence(source, target) {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name)
      const to = path.join(target, entry.name)
      if (entry.isDirectory() && entry.name === "browser") {
        await copyEvidence(from, to)
      } else if (entry.isFile() && names.test(entry.name)) {
        let content = await readFile(from, "utf8")
        for (const secret of secrets)
          content = content.replaceAll(secret, "[redacted]")
        content = content
          .replace(
            /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
            "[redacted database URI]"
          )
          .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [redacted]")
          .replace(
            /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
            "[redacted token]"
          )
          .replace(
            /NEON_AUTH_COOKIE_SECRET["']?\s*[=:]\s*["']?[^\s"'<>]+/gi,
            "NEON_AUTH_COOKIE_SECRET=[redacted]"
          )
          .replace(
            /(?:set-cookie|cookie)["']?\s*:\s*[^\r\n]+/gi,
            "Cookie: [redacted]"
          )
        await mkdir(target, { recursive: true })
        await writeFile(to, content)
      }
    }
  }
  const entries = await readdir(sourceDir, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === "ENOENT") return []
      throw error
    }
  )
  for (const entry of entries) {
    if (entry.isDirectory() && /^integration-[\w-]+$/.test(entry.name)) {
      await copyEvidence(
        path.join(sourceDir, entry.name),
        path.join(outputDir, entry.name)
      )
    }
  }
}

export async function integration({
  evidenceDir = path.resolve(".audit", `integration-${Date.now()}`),
  cwd = process.cwd(),
} = {}) {
  const config = integrationConfig()
  const { verifyNeonAuth } = await import("./neon-auth-e2e.mjs")
  await mkdir(evidenceDir, { recursive: true })
  const branch = await createTestBranch({
    config,
    evidenceDir,
  })
  let scratch
  let worker
  const failures = []
  const cookieSecret = randomBytes(32).toString("base64url")
  const env = {
    ...process.env,
    DATABASE_URL: branch.databaseUrl,
    TEST_DATABASE_URL: branch.databaseUrl,
    NEON_AUTH_BASE_URL: branch.authBaseUrl,
    NEON_AUTH_COOKIE_SECRET: cookieSecret,
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
      branch.databaseUrl,
  }
  async function run(args, name) {
    await new Promise((resolve, reject) => {
      const child = spawn("pnpm", args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      })
      let output = ""
      child.stdout.on("data", (data) => {
        output += data
      })
      child.stderr.on("data", (data) => {
        output += data
      })
      child.on("error", reject)
      child.on("close", async (code) => {
        for (const secret of [branch.databaseUrl, config.apiKey, cookieSecret])
          output = output.replaceAll(secret, "[redacted]")
        output = output
          .replace(
            /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
            "[redacted database URI]"
          )
          .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [redacted]")
        try {
          await writeFile(path.join(evidenceDir, `${name}.log`), output)
          if (code === 0) resolve()
          else
            reject(
              new Error(
                `${name} failed with exit ${code}. See ${path.join(evidenceDir, `${name}.log`)}.`
              )
            )
        } catch (error) {
          reject(error)
        }
      })
    })
  }
  try {
    await run(["--filter", "@workspace/api", "db:migrate"], "migrate")
    await run(
      ["--filter", "@workspace/api", "test:integration"],
      "api-integration"
    )
    scratch = await mkdtemp(path.join(os.tmpdir(), "mercury-integration-"))
    const files = execFileSync("git", ["ls-files", "-z"], {
      cwd,
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean)
    for (const file of files) {
      if (/^(\.agents|\.claude|\.audit|\.github|cli|docs)\//.test(file))
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
    await writeFile(
      path.join(scratch, "apps/api/.env"),
      `DATABASE_URL=${JSON.stringify(branch.databaseUrl)}\n`,
      { mode: 0o600 }
    )
    await writeFile(
      path.join(scratch, "apps/web/.env.local"),
      `NEON_AUTH_BASE_URL=${JSON.stringify(branch.authBaseUrl)}\nCLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=${JSON.stringify(branch.databaseUrl)}\n`,
      { mode: 0o600 }
    )
    await writeFile(
      path.join(scratch, "apps/web/.dev.vars"),
      `NEON_AUTH_COOKIE_SECRET=${JSON.stringify(cookieSecret)}\n`,
      { mode: 0o600 }
    )
    worker = await startWorker({ cwd: scratch, env, evidenceDir })
    await branch.trustOrigin(worker.url)
    await verifyNeonAuth({
      url: worker.url,
      databaseUrl: branch.databaseUrl,
      evidenceDir: path.join(evidenceDir, "browser"),
      cwd,
    })
  } catch (error) {
    failures.push(error)
  } finally {
    for (const cleanup of [
      () => worker?.stop(),
      () => scratch && rm(scratch, { recursive: true, force: true }),
      () => branch.cleanup(),
    ]) {
      try {
        await cleanup()
      } catch (error) {
        failures.push(error)
      }
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      "Integration and owned-resource cleanup had multiple failures. Inspect the cleanup evidence.",
      { cause: failures[0] }
    )
  await writeFile(
    path.join(evidenceDir, "PASS"),
    "Real Neon migrations, isolated API suite, Neon Auth signup/signin, reload, two-user ownership, signout, and cleanup passed.\n"
  )
  console.log(`Live integration passed. Evidence is in ${evidenceDir}.`)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length > 2) {
    console.error("usage: node scripts/integration.mjs")
    process.exitCode = 2
  } else {
    integration().catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
  }
}
