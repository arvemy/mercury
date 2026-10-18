import assert from "node:assert/strict"
import { createServer } from "node:http"
import { realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { setTimeout } from "node:timers/promises"
import { test } from "node:test"

const pluginRequire = createRequire(
  realpathSync(
    new URL(
      "../apps/web/node_modules/@cloudflare/vite-plugin/package.json",
      import.meta.url
    )
  )
)
const miniflarePath = pluginRequire.resolve("miniflare")
const { DispatchFetchDispatcher, Miniflare, convertV4MiniflareOptions } =
  pluginRequire("miniflare")
const { Pool, getGlobalDispatcher, fetch } =
  createRequire(miniflarePath)("undici")

test("preview transport reuses GET sockets and retires sockets after request bodies", async () => {
  const sockets = new Set()
  const requests = []
  const server = createServer(async (request, response) => {
    sockets.add(request.socket)
    requests.push({ socket: request.socket, method: request.method })
    for await (const chunk of request) void chunk
    response.end("ok")
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const pool = new Pool(origin, { connections: 1 })
  const dispatcher = new DispatchFetchDispatcher(
    getGlobalDispatcher(),
    pool,
    origin,
    origin
  )
  try {
    for (const init of [
      {},
      {},
      { method: "POST", body: "payload" },
      {},
      { method: "PUT", body: "payload" },
      {},
      { method: "PATCH", body: "payload" },
      {},
      { method: "DELETE", body: "payload" },
      {},
      { method: "POST" },
      {},
    ]) {
      const response = await fetch(origin, {
        ...init,
        dispatcher,
        signal: AbortSignal.timeout(5000),
      })
      assert.equal(response.status, 200)
      assert.equal(await response.text(), "ok")
    }
    assert.equal(
      requests[0].socket,
      requests[1].socket,
      "bodyless GETs reuse their connection"
    )
    for (const index of [2, 4, 6, 8]) {
      assert.notEqual(
        requests[index].socket,
        requests[index + 1].socket,
        `${requests[index].method} body socket is retired`
      )
    }
    assert.equal(
      requests[10].socket,
      requests[11].socket,
      "bodyless POST preserves reuse"
    )
  } finally {
    await pool.destroy()
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})

test(
  "preview runtime preserves uploads and streamed responses",
  { timeout: 60_000 },
  async () => {
    const worker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        compatibilityDate: "2026-10-01",
        cf: false,
        script: `export default {
      async fetch(request) {
        const route = new URL(request.url).pathname;
        if (route === '/reject') return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (route === '/echo') return new Response(request.body);
        if (route === '/stream') {
          const chunks = 128;
          let sent = 0;
          return new Response(new ReadableStream({
            async pull(controller) {
              if (sent === chunks) { controller.close(); return; }
              await new Promise(resolve => setTimeout(resolve, 1));
              controller.enqueue(new Uint8Array(16384).fill(sent++ % 251));
            }
          }));
        }
        return new Response('ok');
      }
    }`,
      })
    )
    try {
      for (const bytes of [24, 5000, 2 * 1024 * 1024]) {
        const payload = Buffer.alloc(bytes, 97)
        const response = await worker.dispatchFetch("http://localhost/echo", {
          method: "POST",
          body: payload,
        })
        assert.equal(response.status, 200)
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), payload)
      }
      const upload = new ReadableStream({
        async pull(controller) {
          await setTimeout(1)
          controller.enqueue(new Uint8Array(16384).fill(98))
          if (++this.sent === 128) controller.close()
        },
        sent: 0,
      })
      const echo = await worker.dispatchFetch("http://localhost/echo", {
        method: "PUT",
        body: upload,
        duplex: "half",
      })
      assert.equal(echo.status, 200)
      assert.deepEqual(
        Buffer.from(await echo.arrayBuffer()),
        Buffer.alloc(2 * 1024 * 1024, 98)
      )
      for (const init of [{}, { method: "POST", body: "unread" }]) {
        const response = await worker.dispatchFetch(
          "http://localhost/stream",
          init
        )
        assert.equal(response.status, 200)
        const expected = Buffer.concat(
          Array.from({ length: 128 }, (_, i) => Buffer.alloc(16384, i % 251))
        )
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected)
      }
      for (let cycle = 0; cycle < 100; cycle++) {
        const denied = await worker.dispatchFetch("http://localhost/reject", {
          method: "POST",
          body: "x".repeat(5000),
        })
        assert.equal(denied.status, 401)
        assert.deepEqual(await denied.json(), { error: "Unauthorized" })
        const next = await worker.dispatchFetch("http://localhost/")
        assert.equal(next.status, 200)
        assert.equal(await next.text(), "ok")
      }
    } finally {
      await worker.dispose()
    }
  }
)
