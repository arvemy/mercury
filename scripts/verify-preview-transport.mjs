import assert from "node:assert/strict"
import path from "node:path"
import { startWorker } from "./verify-worker.mjs"

const cycles = Number(process.argv[2] ?? 1000)
assert.ok(
  Number.isSafeInteger(cycles) && cycles > 0,
  "cycles must be a positive integer"
)
const evidenceDir = path.resolve(".audit/preview-transport")
const worker = await startWorker({ preview: true, evidenceDir })
const steps = [
  { method: "GET", route: "/api/health", status: 200, json: { status: "ok" } },
  {
    method: "GET",
    route: "/api/todos",
    status: 401,
    json: { error: "Unauthorized" },
  },
  {
    method: "POST",
    route: "/api/todos",
    status: 401,
    json: { error: "Unauthorized" },
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Unauthorized" }),
  },
  { method: "GET", route: "/api/does-not-exist", status: 404 },
  {
    method: "GET",
    route: "/api/does-not-exist",
    status: 404,
    headers: { "Sec-Fetch-Mode": "navigate", Accept: "text/html" },
  },
  { method: "GET", route: "/assets/does-not-exist.js", status: 404 },
]

try {
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const step of steps) {
      const response = await fetch(worker.url + step.route, {
        method: step.method,
        headers: step.headers,
        body: step.body,
        signal: AbortSignal.timeout(10_000),
      })
      const body = await response.text()
      const label = `cycle ${cycle + 1}, ${step.method} ${step.route}`
      assert.equal(response.status, step.status, label)
      if (step.json) assert.deepEqual(JSON.parse(body), step.json, label)
      else assert.doesNotMatch(body, /<div id="root">/, label)
    }
  }
  console.log(
    `${cycles} preview cycles, ${cycles * steps.length} responses, zero failures`
  )
} finally {
  await worker.stop()
}
