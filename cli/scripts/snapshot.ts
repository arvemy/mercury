import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { renameDotfiles } from "../src/scaffold.js"

export const EXCLUDED = [
  ".agents/skills/verify-create-mercury/",
  ".agents/skills/verify-mercury/",
  ".claude/",
  ".github/workflows/create-mercury.yml",
  ".github/workflows/release.yml",
  "cli/",
  "LICENSE",
]

export function isTemplateFile(file: string) {
  return !EXCLUDED.some((excluded) =>
    excluded.endsWith("/") ? file.startsWith(excluded) : file === excluded
  )
}

export function withoutCliWorkspace(workspaceYaml: string) {
  return workspaceYaml.replace(/^\s*- "cli"\n/m, "")
}

export function snapshot(repoRoot: string, templateDir: string) {
  fs.rmSync(templateDir, { recursive: true, force: true })

  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .filter(isTemplateFile)

  for (const file of tracked) {
    const from = path.join(repoRoot, file)
    if (!fs.existsSync(from)) continue
    const to = path.join(templateDir, file)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }

  const workspacePath = path.join(templateDir, "pnpm-workspace.yaml")
  fs.writeFileSync(
    workspacePath,
    withoutCliWorkspace(fs.readFileSync(workspacePath, "utf8"))
  )
  execFileSync("pnpm", ["install", "--lockfile-only", "--silent"], {
    cwd: templateDir,
    stdio: "inherit",
  })

  fs.copyFileSync(
    path.join(repoRoot, "cli/project-readme.md"),
    path.join(templateDir, "README.md")
  )
  renameDotfiles(templateDir, "pack")
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cliDir = fileURLToPath(new URL("../..", import.meta.url))
  snapshot(path.resolve(cliDir, ".."), path.join(cliDir, "template"))
}
