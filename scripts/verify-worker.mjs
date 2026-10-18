import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, appendFile } from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

export async function startWorker({
  cwd = process.cwd(),
  env = {},
  evidenceDir,
  preview = false,
}) {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  const url = `http://127.0.0.1:${port}`
  await mkdir(evidenceDir, { recursive: true })
  const log = path.join(evidenceDir, "worker.log")
  const child = spawn(
    "pnpm",
    [
      "exec",
      "vp",
      preview ? "preview" : "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: path.join(cwd, "apps/web"),
      env: {
        ...process.env,
        ...env,
        APP_ORIGIN: url,
        NO_COLOR: "1",
        WRANGLER_SEND_METRICS: "false",
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  let spawnError
  child.on("error", (error) => {
    spawnError = error
  })
  const secrets = [
    env.DATABASE_URL,
    env.NEON_AUTH_COOKIE_SECRET,
    env.NEON_API_KEY,
    env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE,
  ].filter(Boolean)
  let writes = Promise.resolve()
  let pending = ""
  function capture(chunk, flush = false) {
    pending += String(chunk)
    const end = flush ? pending.length : pending.lastIndexOf("\n") + 1
    let text = pending.slice(0, end)
    pending = pending.slice(end)
    for (const secret of secrets) text = text.replaceAll(secret, "[redacted]")
    text = text
      .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database URI]")
      .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [redacted]")
    writes = writes.then(() => appendFile(log, text))
  }
  child.stdout.on("data", capture)
  child.stderr.on("data", capture)
  let stopped = false
  async function stop() {
    if (stopped) return
    stopped = true
    if (child.pid && child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGTERM")
      } catch (error) {
        if (error.code !== "ESRCH") throw error
      }
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000).unref()),
      ])
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch (error) {
        if (error.code !== "ESRCH") throw error
      }
    }
    capture("", true)
    await writes
  }
  try {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError
      if (child.exitCode !== null)
        throw new Error(`Worker exited with ${child.exitCode}. See ${log}.`)
      const ready = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(1000),
      }).then(
        async (response) => {
          await response.arrayBuffer()
          return response.ok
        },
        () => false
      )
      if (ready) return { url, stop }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(
      `Worker did not become ready within 60 seconds. See ${log}.`
    )
  } catch (error) {
    await stop()
    throw error
  }
}

export async function verifyHttpWorker({ url, evidenceDir }) {
  await mkdir(evidenceDir, { recursive: true })
  const results = []
  const request = (pathname, options = {}) =>
    fetch(new URL(pathname, url), {
      ...options,
      signal: AbortSignal.timeout(15_000),
    })
  for (const route of [
    "/",
    "/todos",
    "/sign-in",
    "/sign-up",
    "/reset-password",
  ]) {
    const response = await request(route, {
      redirect: "manual",
      headers: { "Sec-Fetch-Mode": "navigate", Accept: "text/html" },
    })
    assert.equal(response.status, 200, `${route} serves the SPA`)
    assert.equal(
      response.headers.get("location"),
      null,
      `${route} keeps its path`
    )
    assert.doesNotMatch(
      response.headers.get("cache-control") ?? "",
      /immutable/
    )
    assert.equal(response.headers.get("x-content-type-options"), "nosniff")
    assert.equal(
      response.headers.get("referrer-policy"),
      "strict-origin-when-cross-origin"
    )
    const html = await response.text()
    assert.match(html, /<div id="root">/, `${route} returns the built HTML`)
    results.push(`${route} -> 200 SPA`)
    if (route === "/") {
      const asset = html.match(/src="(\/assets\/[^"]+)"/)?.[1]
      assert.ok(asset, "built HTML references a hashed JavaScript asset")
      const script = await request(asset)
      assert.equal(script.status, 200)
      assert.match(script.headers.get("content-type") ?? "", /javascript/)
      assert.match(
        script.headers.get("cache-control") ?? "",
        /max-age=31536000, immutable/
      )
      assert.doesNotMatch(script.headers.get("cache-control") ?? "", /no-cache/)
      assert.ok((await script.arrayBuffer()).byteLength > 0)
      results.push("hashed JavaScript -> 200 with immutable caching")
    }
  }
  const health = await request("/api/health")
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: "ok" })
  results.push("/api/health -> 200 ok")
  for (const method of ["GET", "POST"]) {
    const response = await request("/api/todos", {
      method,
      ...(method === "POST"
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "Unauthorized" }),
          }
        : {}),
    })
    assert.equal(response.status, 401, `anonymous ${method} /api/todos`)
    assert.match(
      response.headers.get("content-type") ?? "",
      /application\/json/
    )
    assert.deepEqual(await response.json(), { error: "Unauthorized" })
    results.push(`${method} /api/todos -> 401 JSON`)
  }
  for (const headers of [
    {},
    { "Sec-Fetch-Mode": "navigate", Accept: "text/html" },
  ]) {
    const missingApi = await request("/api/does-not-exist", {
      headers,
    })
    assert.equal(missingApi.status, 404)
    assert.doesNotMatch(await missingApi.text(), /<div id="root">/)
  }
  results.push("/api/does-not-exist -> 404 without SPA fallback")
  const missingAsset = await request("/assets/does-not-exist.js")
  assert.equal(missingAsset.status, 404)
  await missingAsset.arrayBuffer()
  results.push("/assets/does-not-exist.js -> 404")
  await appendFile(
    path.join(evidenceDir, "checks.log"),
    results.join("\n") + "\n"
  )
  console.log(results.join("\n"))
  return results
}

export async function verifyWorker({
  cwd = process.cwd(),
  evidenceDir = path.resolve(".audit/worker-smoke"),
} = {}) {
  const worker = await startWorker({ cwd, evidenceDir, preview: true })
  try {
    return await verifyHttpWorker({ url: worker.url, evidenceDir })
  } finally {
    await worker.stop()
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyWorker().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
