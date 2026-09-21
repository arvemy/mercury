import { describe, expect, it } from "vitest"
import { app } from "./app.js"

describe("app", () => {
  it("GET /api/health", async () => {
    const res = await app.request("/api/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "ok" })
  })

  it("GET /api/hello?name=Ada", async () => {
    const res = await app.request("/api/hello?name=Ada")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: "Hello, Ada!" })
  })

  it("GET /api/hello without name is 400", async () => {
    const res = await app.request("/api/hello")
    expect(res.status).toBe(400)
  })
})
