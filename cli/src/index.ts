#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import path from "node:path"
import readline from "node:readline/promises"
import { fileURLToPath } from "node:url"
import { parseProjectName, scaffold, type ProjectName } from "./scaffold.js"

const templateDir = fileURLToPath(new URL("../../template", import.meta.url))

async function askProjectName(): Promise<ProjectName> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  rl.on("SIGINT", () => {
    rl.close()
    process.stdout.write("\n")
    process.exit(130)
  })
  try {
    for (;;) {
      const answer = await rl.question("Project name: ")
      try {
        return parseProjectName(answer)
      } catch (error) {
        console.error((error as Error).message)
      }
    }
  } finally {
    rl.close()
  }
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" })
  return result.status === 0
}

async function main() {
  const arg = process.argv[2]
  let projectName: ProjectName
  if (arg !== undefined) {
    projectName = parseProjectName(arg)
  } else if (process.stdin.isTTY) {
    projectName = await askProjectName()
  } else {
    throw new Error("Usage: pnpm create mercury <project-name>")
  }

  const targetDir = path.resolve(projectName)
  scaffold({ projectName, targetDir, templateDir })
  console.log(`\nCreated ${projectName} in ${targetDir}\n`)

  // git init runs first so the template's husky prepare script finds a repo.
  const hasGit = run(
    "git",
    ["init", "--quiet", "--initial-branch=main"],
    targetDir
  )
  if (!hasGit) console.warn("git init failed. Skipping the initial commit.")

  if (!run("pnpm", ["install"], targetDir)) {
    console.error(
      `\npnpm install failed. Run it again with:\n\n  cd ${projectName}\n  pnpm install\n`
    )
    process.exit(1)
  }

  if (hasGit) {
    const committed =
      run("git", ["add", "-A"], targetDir) &&
      run(
        "git",
        [
          "commit",
          "--quiet",
          "--no-verify",
          "-m",
          "Initial commit from create-mercury",
        ],
        targetDir
      )
    if (!committed)
      console.warn("git commit failed. Commit the project yourself.")
  }

  console.log(`
Done. Next steps:

  cd ${projectName}
  pnpm dev
`)
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
