import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const api = "https://console.neon.tech/api/v2"

export function integrationConfig(env = process.env) {
  const required = ["NEON_API_KEY", "NEON_PROJECT_ID", "NEON_BRANCH_ID"]
  const missing = required.filter((key) => !env[key]?.trim())
  if (missing.length) {
    throw new Error(
      `Live integration requires ${missing.join(", ")}. Use an isolated nonproduction Neon project. See README.md.`
    )
  }
  return {
    apiKey: env.NEON_API_KEY,
    projectId: env.NEON_PROJECT_ID,
    parentId: env.NEON_BRANCH_ID,
    database: env.NEON_DATABASE_NAME || "neondb",
    role: env.NEON_ROLE_NAME || "neondb_owner",
  }
}

export async function createTestBranch({ config, evidenceDir }) {
  const name = `mercury-test-${randomUUID()}`
  const projectPath = `/projects/${encodeURIComponent(config.projectId)}`
  const pause = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))

  async function request(
    route,
    options = {},
    { deadline = Date.now() + 120_000, notFound = false, empty = false } = {}
  ) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const remaining = deadline - Date.now()
      if (remaining <= 0)
        throw new Error("Timed out waiting for Neon operations.")
      let response
      try {
        response = await fetch(`${api}${projectPath}${route}`, {
          ...options,
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(Math.min(30_000, remaining)),
        })
      } catch {
        throw new Error("Neon API request failed or timed out.")
      }
      if ([423, 503].includes(response.status) && attempt < 19) {
        await pause(Math.min(1000, Math.max(0, deadline - Date.now())))
        continue
      }
      if (notFound && response.status === 404) return
      if (options.method === "DELETE" && [204, 404].includes(response.status))
        return
      if (!response.ok) {
        throw new Error(
          `Neon ${options.method ?? "GET"} ${route.split("?")[0]} failed with HTTP ${response.status}. Check the nonproduction project permissions.`
        )
      }
      if (empty) return
      try {
        return await response.json()
      } catch {
        throw new Error("Neon API returned an invalid JSON response.")
      }
    }
  }

  async function waitForOperations(result) {
    if (!Array.isArray(result?.operations)) {
      throw new Error("Neon did not return the branch operations.")
    }
    const deadline = Date.now() + 120_000
    for (let operation of result.operations) {
      if (typeof operation?.id !== "string" || !operation.id) {
        throw new Error("Neon returned an invalid operation ID.")
      }
      const route = `/operations/${encodeURIComponent(operation.id)}`
      while (!["finished", "skipped"].includes(operation.status)) {
        if (["failed", "error", "cancelled"].includes(operation.status)) {
          throw new Error(`Neon branch operation ${operation.status}.`)
        }
        if (
          !["scheduling", "running", "cancelling"].includes(operation.status)
        ) {
          throw new Error("Neon returned an unknown operation status.")
        }
        const next = await request(route, {}, { deadline })
        if (next?.operation?.id !== operation.id) {
          throw new Error("Neon returned an unexpected operation ID.")
        }
        operation = next.operation
        if (
          ["scheduling", "running", "cancelling"].includes(operation.status)
        ) {
          await pause(Math.min(1000, Math.max(0, deadline - Date.now())))
        }
      }
    }
  }

  const created = await request("/branches", {
    method: "POST",
    body: JSON.stringify({
      branch: { name, parent_id: config.parentId },
      endpoints: [{ type: "read_write" }],
    }),
  })
  const branchId = created?.branch?.id
  if (
    typeof branchId !== "string" ||
    !/^[a-z0-9-]{1,60}$/.test(branchId) ||
    branchId === config.parentId
  ) {
    throw new Error(
      "Neon did not return a new test branch ID. Inspect the project before retrying."
    )
  }
  async function cleanup() {
    const deleted = await request(`/branches/${encodeURIComponent(branchId)}`, {
      method: "DELETE",
    })
    if (deleted !== undefined) await waitForOperations(deleted)
    await writeFile(
      path.join(evidenceDir, "neon-cleanup.txt"),
      `Deleted owned test branch ${branchId}\n`
    )
  }
  try {
    await mkdir(evidenceDir, { recursive: true })
    await writeFile(
      path.join(evidenceDir, "neon-branch.json"),
      JSON.stringify(
        {
          projectId: config.projectId,
          parentId: config.parentId,
          branchId,
          name,
        },
        null,
        2
      ) + "\n"
    )
    await waitForOperations(created)
    const query = new URLSearchParams({
      branch_id: branchId,
      database_name: config.database,
      role_name: config.role,
      pooled: "false",
    })
    const result = await request(`/connection_uri?${query}`)
    if (
      typeof result?.uri !== "string" ||
      !/^postgres(ql)?:\/\//.test(result.uri)
    ) {
      throw new Error(
        "Neon did not return a PostgreSQL connection URI for the test branch."
      )
    }
    const authRoute = `/branches/${encodeURIComponent(branchId)}/auth`
    let auth = await request(authRoute, {}, { notFound: true })
    if (auth === undefined) {
      await request(authRoute, {
        method: "POST",
        body: JSON.stringify({
          auth_provider: "better_auth",
          database_name: config.database,
        }),
      })
      auth = await request(authRoute)
    }
    let authUrl
    try {
      authUrl = new URL(auth?.base_url)
    } catch {
      throw new Error("Neon did not return the owned branch's Auth URL.")
    }
    if (
      auth?.branch_id !== branchId ||
      auth?.db_name !== config.database ||
      auth?.auth_provider !== "better_auth" ||
      authUrl.protocol !== "https:" ||
      authUrl.username ||
      authUrl.password ||
      authUrl.search ||
      authUrl.hash ||
      !authUrl.pathname.endsWith("/auth")
    ) {
      throw new Error(
        "Neon returned an unexpected owned-branch Auth configuration."
      )
    }
    const emailRoute = `${authRoute}/email_and_password`
    const emailConfig = { enabled: true, require_email_verification: false }
    await request(emailRoute, {
      method: "PATCH",
      body: JSON.stringify(emailConfig),
    })
    const email = await request(emailRoute)
    if (
      !Object.entries(emailConfig).every(
        ([key, value]) => email?.[key] === value
      )
    ) {
      throw new Error(
        "Neon did not apply the owned branch's test email/password configuration."
      )
    }
    if (email.disable_sign_up === true) {
      throw new Error(
        "The owned test branch disables sign-up; the live signup proof cannot run."
      )
    }
    await writeFile(
      path.join(evidenceDir, "neon-auth.json"),
      JSON.stringify(
        {
          branchId,
          provider: "better_auth",
          emailPassword: true,
          requireEmailVerification: false,
        },
        null,
        2
      ) + "\n"
    )
    async function trustOrigin(origin, { remoteOrigin } = {}) {
      const local = new URL(origin)
      const loopback =
        local.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(local.hostname)
      const ownedWorker =
        origin === remoteOrigin &&
        local.protocol === "https:" &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.workers\.dev$/.test(
          local.hostname
        )
      if (
        local.origin !== origin ||
        local.username ||
        local.password ||
        (!loopback && !ownedWorker)
      ) {
        throw new Error(
          "The test branch accepts only the owned local Worker's origin or an exact owned workers.dev origin."
        )
      }
      const route = `${authRoute}/domains`
      const containsOrigin = (result) => {
        if (!Array.isArray(result?.domains))
          throw new Error("Neon returned an invalid trusted-domain list.")
        return result.domains.some(
          (domain) =>
            domain?.domain === origin && domain?.auth_provider === "better_auth"
        )
      }
      if (!containsOrigin(await request(route))) {
        await request(
          route,
          {
            method: "POST",
            body: JSON.stringify({
              domain: origin,
              auth_provider: "better_auth",
            }),
          },
          { empty: true }
        )
        if (!containsOrigin(await request(route)))
          throw new Error("Neon did not trust the owned local Worker's origin.")
      }
      await writeFile(
        path.join(evidenceDir, "neon-auth-origin.json"),
        JSON.stringify({ branchId, origin }, null, 2) + "\n"
      )
    }
    return {
      branchId,
      databaseUrl: result.uri,
      authBaseUrl: auth.base_url,
      trustOrigin,
      cleanup,
    }
  } catch (error) {
    try {
      await cleanup()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Neon branch setup failed; cleanup or its evidence also failed. Inspect the owned test branch.",
        { cause: cleanupError }
      )
    }
    throw error
  }
}
