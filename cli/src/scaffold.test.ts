import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { beforeEach, describe, expect, it } from "vite-plus/test"
import { parseProjectName, scaffold } from "./scaffold.js"

describe("parseProjectName", () => {
  it("accepts a lowercase npm name", () => {
    expect(parseProjectName("my-app")).toBe("my-app")
  })

  it("rejects uppercase and spaces", () => {
    expect(() => parseProjectName("My App")).toThrow(
      "Project name must be lowercase and use only letters, digits, and - . _ ~"
    )
  })

  it("rejects path traversal", () => {
    expect(() => parseProjectName("../x")).toThrow(
      "Project name must be lowercase and use only letters, digits, and - . _ ~"
    )
  })

  it("rejects an empty name", () => {
    expect(() => parseProjectName("  ")).toThrow("Project name is required.")
  })
})

describe("scaffold", () => {
  let root: string
  let templateDir: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "create-mercury-"))
    templateDir = path.join(root, "template")
    fs.mkdirSync(path.join(templateDir, "apps/api"), { recursive: true })
    fs.mkdirSync(path.join(templateDir, "apps/web"), { recursive: true })
    fs.mkdirSync(path.join(templateDir, ".agents/skills/mantine-form"), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(templateDir, ".agents/skills/mantine-form/SKILL.md"),
      "# mantine-form\n"
    )
    fs.writeFileSync(
      path.join(templateDir, "apps/web/index.html"),
      "<head>\n    <title>Mercury</title>\n</head>\n"
    )
    fs.writeFileSync(
      path.join(templateDir, "apps/web/cloudflare.config.ts"),
      'const projectName = "mercury"\n'
    )
    fs.writeFileSync(path.join(templateDir, "_gitignore"), "node_modules\n")
    fs.writeFileSync(path.join(templateDir, "_npmrc"), "")
    fs.writeFileSync(
      path.join(templateDir, "README.md"),
      "# Mercury app\n\nCreated with Mercury.\n"
    )
    fs.writeFileSync(
      path.join(templateDir, "package.json"),
      JSON.stringify({ name: "mercury", private: true })
    )
    fs.writeFileSync(
      path.join(templateDir, "apps/api/.env.example"),
      "DATABASE_URL=\n"
    )
    fs.writeFileSync(
      path.join(templateDir, "apps/web/.env.example"),
      "APP_ORIGIN=http://localhost:5173\nNEON_AUTH_BASE_URL=\nCLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=\n"
    )
    fs.writeFileSync(
      path.join(templateDir, "apps/web/.dev.vars.example"),
      "NEON_AUTH_COOKIE_SECRET=\n"
    )
  })

  it("writes a project with restored dotfiles, its name, and an env file", () => {
    const targetDir = path.join(root, "my-app")
    scaffold({
      projectName: parseProjectName("my-app"),
      targetDir,
      templateDir,
    })

    expect(fs.readdirSync(targetDir).sort()).toEqual([
      ".agents",
      ".claude",
      ".gitignore",
      ".npmrc",
      "README.md",
      "apps",
      "package.json",
    ])
    expect(fs.readFileSync(path.join(targetDir, "README.md"), "utf8")).toBe(
      "# my-app\n\nCreated with Mercury.\n"
    )
    expect(fs.readFileSync(path.join(targetDir, ".gitignore"), "utf8")).toBe(
      "node_modules\n"
    )
    expect(
      JSON.parse(fs.readFileSync(path.join(targetDir, "package.json"), "utf8"))
    ).toEqual({ name: "my-app", private: true })
    expect(fs.readFileSync(path.join(targetDir, "apps/api/.env"), "utf8")).toBe(
      "DATABASE_URL=\n"
    )
    expect(
      fs.readFileSync(path.join(targetDir, "apps/web/.env.local"), "utf8")
    ).toBe(
      "APP_ORIGIN=http://localhost:5173\nNEON_AUTH_BASE_URL=\nCLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=\n"
    )
    expect(
      fs.readFileSync(path.join(targetDir, "apps/web/.dev.vars"), "utf8")
    ).toBe("NEON_AUTH_COOKIE_SECRET=\n")
    expect(
      fs.readFileSync(path.join(targetDir, "apps/web/index.html"), "utf8")
    ).toBe("<head>\n    <title>my-app</title>\n</head>\n")
    expect(
      fs.readlinkSync(path.join(targetDir, ".claude/skills/mantine-form"))
    ).toBe("../../.agents/skills/mantine-form")
    expect(
      fs.readFileSync(
        path.join(targetDir, ".claude/skills/mantine-form/SKILL.md"),
        "utf8"
      )
    ).toBe("# mantine-form\n")
  })

  it("gives long and punctuated project names distinct valid Worker prefixes", () => {
    const prefixes = []
    for (const name of ["foo.bar", "foo-bar", "a".repeat(214)]) {
      const targetDir = path.join(root, name)
      scaffold({ projectName: parseProjectName(name), targetDir, templateDir })
      const config = fs.readFileSync(
        path.join(targetDir, "apps/web/cloudflare.config.ts"),
        "utf8"
      )
      const prefix = config.match(/const projectName = "([^"]+)"/)?.[1]
      expect(prefix).toMatch(/^[a-z0-9][a-z0-9-]*$/)
      expect(`${prefix}-production`.length).toBeLessThanOrEqual(63)
      prefixes.push(prefix)
    }
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })

  it("refuses a non-empty target without writing", () => {
    const targetDir = path.join(root, "my-app")
    fs.mkdirSync(targetDir)
    fs.writeFileSync(path.join(targetDir, "keep.txt"), "")

    expect(() =>
      scaffold({
        projectName: parseProjectName("my-app"),
        targetDir,
        templateDir,
      })
    ).toThrow(`${targetDir} already exists and is not empty.`)
    expect(fs.readdirSync(targetDir)).toEqual(["keep.txt"])
  })
})
