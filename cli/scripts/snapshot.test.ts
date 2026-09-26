import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { isTemplateFile, snapshot, withoutCliWorkspace } from "./snapshot.js"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort()
}

describe("isTemplateFile", () => {
  it("keeps app files and the user-facing CI workflow", () => {
    expect(isTemplateFile("apps/api/src/app.ts")).toBe(true)
    expect(isTemplateFile(".github/workflows/ci.yml")).toBe(true)
  })

  it("drops repo-only files", () => {
    expect(isTemplateFile("cli/src/index.ts")).toBe(false)
    expect(isTemplateFile(".claude/skills/x/SKILL.md")).toBe(false)
    expect(isTemplateFile(".github/workflows/release.yml")).toBe(false)
    expect(isTemplateFile("skills-lock.json")).toBe(false)
    expect(isTemplateFile("LICENSE")).toBe(false)
  })
})

describe("withoutCliWorkspace", () => {
  it("removes only the cli entry", () => {
    expect(
      withoutCliWorkspace(
        'packages:\n  - "apps/*"\n  - "packages/*"\n  - "cli"\n\nallowBuilds:\n'
      )
    ).toBe('packages:\n  - "apps/*"\n  - "packages/*"\n\nallowBuilds:\n')
  })
})

describe("snapshot", () => {
  it("produces the same template on every run, with no cli importer", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-snapshot-"))
    const first = path.join(out, "first")
    const second = path.join(out, "second")
    snapshot(repoRoot, first)
    snapshot(repoRoot, second)
    snapshot(repoRoot, second)

    const files = listFiles(first)
    expect(listFiles(second)).toEqual(files)
    expect(files).toContain("_gitignore")
    expect(files).not.toContain(".gitignore")
    expect(files.some((file) => file.startsWith("cli/"))).toBe(false)
    expect(
      fs.readFileSync(path.join(first, "pnpm-lock.yaml"), "utf8")
    ).not.toMatch(/^ {2}cli:$/m)
  })
})
