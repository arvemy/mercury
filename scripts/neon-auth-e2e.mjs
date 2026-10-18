import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { mkdir, writeFile, appendFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { chromium, expect } from "@playwright/test"

function redactSecrets(text, secrets) {
  for (const secret of secrets) text = text.replaceAll(secret, "[redacted]")
  return text
}

function browserFailure(error, secrets) {
  return new Error(
    redactSecrets(
      error instanceof Error
        ? error.message
        : "Neon Auth browser proof failed.",
      secrets
    )
  )
}

export async function captureAuthEvidence({
  page,
  name,
  evidenceDir,
  secrets,
}) {
  const sensitive = page.locator(
    'input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"], input[autocomplete="one-time-code"]'
  )
  for (const value of await sensitive.evaluateAll((inputs) =>
    inputs.map((input) => input.value)
  ))
    if (value) secrets.add(value)
  await page.screenshot({
    path: path.join(evidenceDir, `${name}.png`),
    fullPage: true,
    mask: [sensitive],
  })
  await writeFile(
    path.join(evidenceDir, `${name}.aria.txt`),
    redactSecrets(await page.locator("body").ariaSnapshot(), secrets)
  )
}

export async function verifyNeonAuth({
  url,
  databaseUrl,
  evidenceDir,
  cwd = process.cwd(),
}) {
  await mkdir(evidenceDir, { recursive: true })
  const users = ["Alice", "Bob"].map((name) => ({
    name: `Mercury ${name}`,
    email: `mercury-${randomUUID()}@example.com`,
    password: `${randomBytes(24).toString("base64url")}Aa1!`,
  }))
  const secrets = new Set(users.map(({ password }) => password))
  const identities = []
  const pageErrors = []
  let browser
  let networkWrites = Promise.resolve()
  const require = createRequire(path.join(cwd, "apps/api/package.json"))
  const { Client } = require("pg")
  async function shot(page, name) {
    await captureAuthEvidence({ page, name, evidenceDir, secrets })
  }
  async function note(text) {
    console.log(text)
    await appendFile(path.join(evidenceDir, "checks.log"), `${text}\n`)
  }
  async function sessionIdentity(page) {
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/auth/get-session")
      if (!response.ok) return { status: response.status }
      const body = await response.json()
      return {
        userId: body?.user?.id,
        sessionUserId: body?.session?.userId,
      }
    })
    assert.equal(
      typeof result.userId,
      "string",
      "Neon Auth supplies the user ID"
    )
    assert.ok(result.userId.length > 0)
    assert.equal(result.sessionUserId, result.userId)
    return result.userId
  }
  async function signOut(page) {
    await page.getByRole("button", { name: "Sign out", exact: true }).click()
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true })
    ).toHaveCount(0)
    await page.goto(`${url}/todos`)
    await expect(
      page.getByRole("textbox", { name: "New todo", exact: true })
    ).toHaveCount(0)
    assert.equal((await page.request.get(`${url}/api/todos`)).status(), 401)
  }
  async function signIn(page, user) {
    await page.goto(`${url}/sign-in`)
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(user.email)
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill(user.password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(
      page.getByRole("textbox", { name: "New todo", exact: true })
    ).toBeVisible({ timeout: 30_000 })
  }
  try {
    browser = await chromium.launch()
    const anonymous = await browser.newPage({ colorScheme: "light" })
    await anonymous.goto(`${url}/`)
    await expect(anonymous.getByText("API: ok", { exact: true })).toBeVisible()
    await expect(anonymous.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "light"
    )
    await shot(anonymous, "00-home-light")
    await anonymous.evaluate(() =>
      localStorage.setItem("mantine-color-scheme-value", "dark")
    )
    await anonymous.reload()
    await expect(anonymous.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "dark"
    )
    await shot(anonymous, "00-home-dark")
    await anonymous.goto(`${url}/todos`)
    await expect(
      anonymous.getByRole("textbox", { name: "New todo", exact: true })
    ).toHaveCount(0)
    assert.equal(
      (await anonymous.request.get(`${url}/api/todos`)).status(),
      401
    )
    await shot(anonymous, "01-anonymous")
    await note("Anonymous /todos has no todo form; GET /api/todos -> 401.")
    await anonymous.close()

    const pages = []
    for (const user of users) {
      const context = await browser.newContext({
        viewport: { width: 1000, height: 700 },
      })
      const page = await context.newPage()
      page.on("pageerror", (error) => pageErrors.push(error.name))
      page.on("response", (response) => {
        const pathname = new URL(response.url()).pathname
        if (!pathname.startsWith("/api/")) return
        networkWrites = networkWrites.then(() =>
          appendFile(
            path.join(evidenceDir, "network.log"),
            JSON.stringify({
              method: response.request().method(),
              path: pathname,
              status: response.status(),
            }) + "\n"
          )
        )
      })
      await page.goto(`${url}/sign-up`)
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill(user.name)
      await page
        .getByRole("textbox", { name: "Email", exact: true })
        .fill(user.email)
      await page
        .getByRole("textbox", { name: "Password", exact: true })
        .fill(user.password)
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click()
      await expect(
        page.getByRole("textbox", { name: "New todo", exact: true })
      ).toBeVisible({ timeout: 30_000 })
      const id = await sessionIdentity(page)
      identities.push({ id, email: user.email })
      await writeFile(
        path.join(evidenceDir, "neon-auth-users.json"),
        JSON.stringify(identities, null, 2) + "\n"
      )
      await signOut(page)
      await signIn(page, user)
      assert.equal(await sessionIdentity(page), id)
      pages.push(page)
    }
    assert.notEqual(identities[0].id, identities[1].id)
    await note(
      "Both users registered, signed out, and signed back in through the UI with real same-origin Neon Auth cookies."
    )
    const [owner, other] = pages
    await owner.getByRole("link", { name: "Home", exact: true }).click()
    await expect(owner.getByText("API: ok", { exact: true })).toBeVisible()
    await owner.getByRole("link", { name: "Todos", exact: true }).click()
    await expect(
      owner.getByRole("textbox", { name: "New todo", exact: true })
    ).toBeVisible()
    await shot(owner, "02-owner-before")
    const title = `Private todo ${randomUUID()}`
    await owner
      .getByRole("textbox", { name: "New todo", exact: true })
      .fill(`  ${title}  `)
    const responsePromise = owner.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/todos"
    )
    await owner.getByRole("button", { name: "Add", exact: true }).click()
    assert.equal((await responsePromise).status(), 201)
    await expect(owner.getByText(title, { exact: true })).toBeVisible()
    await expect(
      owner.getByRole("textbox", { name: "New todo", exact: true })
    ).toHaveValue("")
    await shot(owner, "03-owner-after")
    await owner.reload()
    await expect(owner.getByText(title, { exact: true })).toBeVisible()
    assert.equal(await sessionIdentity(owner), identities[0].id)
    await shot(owner, "04-owner-reloaded")
    await other.reload()
    await expect(other.getByText(title, { exact: true })).toHaveCount(0)
    const ownList = await owner.evaluate(async () =>
      (await fetch("/api/todos")).json()
    )
    const otherList = await other.evaluate(async () =>
      (await fetch("/api/todos")).json()
    )
    assert(ownList.some((todo) => todo.title === title))
    assert(!otherList.some((todo) => todo.title === title))
    await shot(other, "05-other-user")
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      const result = await client.query(
        'select id, title, completed, "ownerId" from todos where title = $1',
        [title]
      )
      assert.equal(result.rows.length, 1)
      assert.equal(result.rows[0].ownerId, identities[0].id)
      assert.equal(result.rows[0].title, title)
      await writeFile(
        path.join(evidenceDir, "database.json"),
        JSON.stringify(result.rows, null, 2) + "\n"
      )
    } finally {
      await client.end()
    }
    await note(
      "Owner created a trimmed todo through the UI; POST -> 201; reload restored the session and todo; the other user cannot read it; the Neon row has the owner's Neon Auth ID."
    )
    await signOut(owner)
    await shot(owner, "06-signed-out")
    await note(
      "After sign-out the todo form disappears and GET /api/todos -> 401."
    )
    assert.deepEqual(pageErrors, [], "The browser has no uncaught page errors")
  } catch (error) {
    for (const [index, context] of (browser?.contexts() ?? []).entries()) {
      for (const page of context.pages())
        await shot(page, `FAILED-${index}`).catch(() => undefined)
    }
    throw browserFailure(error, secrets)
  } finally {
    await browser?.close()
    await networkWrites
  }
}
