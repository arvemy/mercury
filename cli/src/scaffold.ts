import fs from "node:fs"
import path from "node:path"

export type ProjectName = string & { readonly __brand: "ProjectName" }

export type ScaffoldOptions = {
  projectName: ProjectName
  targetDir: string
  templateDir: string
}

// npm strips these from published tarballs, so the template ships them renamed.
export const DOTFILES = {
  ".gitignore": "_gitignore",
  ".npmrc": "_npmrc",
} as const

const NAME_PATTERN = /^[a-z0-9][a-z0-9._~-]*$/

export function parseProjectName(input: string): ProjectName {
  const name = input.trim()
  if (name.length === 0) throw new Error("Project name is required.")
  if (name.length > 214) {
    throw new Error("Project name must be 214 characters or fewer.")
  }
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      "Project name must be lowercase and use only letters, digits, and - . _ ~"
    )
  }
  return name as ProjectName
}

export function renameDotfiles(dir: string, direction: "pack" | "unpack") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      renameDotfiles(full, direction)
      continue
    }
    for (const [real, packed] of Object.entries(DOTFILES)) {
      const [from, to] = direction === "pack" ? [real, packed] : [packed, real]
      if (entry.name === from) fs.renameSync(full, path.join(dir, to))
    }
  }
}

// Claude Code reads skills from .claude/skills, other agents from .agents/skills.
export function linkAgentSkills(dir: string) {
  const skillsDir = path.join(dir, ".agents/skills")
  if (!fs.existsSync(skillsDir)) return
  const linksDir = path.join(dir, ".claude/skills")
  fs.mkdirSync(linksDir, { recursive: true })
  for (const name of fs.readdirSync(skillsDir)) {
    const link = path.join(linksDir, name)
    try {
      fs.symlinkSync(path.join("../../.agents/skills", name), link, "dir")
    } catch {
      fs.cpSync(path.join(skillsDir, name), link, { recursive: true })
    }
  }
}

export function scaffold({
  projectName,
  targetDir,
  templateDir,
}: ScaffoldOptions) {
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new Error(`${targetDir} already exists and is not empty.`)
  }
  fs.cpSync(templateDir, targetDir, { recursive: true })
  renameDotfiles(targetDir, "unpack")
  linkAgentSkills(targetDir)

  const pkgPath = path.join(targetDir, "package.json")
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
  fs.writeFileSync(
    pkgPath,
    JSON.stringify({ ...pkg, name: projectName }, null, 2) + "\n"
  )

  const indexHtml = path.join(targetDir, "apps/web/index.html")
  if (fs.existsSync(indexHtml)) {
    const html = fs.readFileSync(indexHtml, "utf8")
    fs.writeFileSync(
      indexHtml,
      html.replace(/<title>.*<\/title>/, `<title>${projectName}</title>`)
    )
  }

  const readme = path.join(targetDir, "README.md")
  if (fs.existsSync(readme)) {
    const text = fs.readFileSync(readme, "utf8")
    fs.writeFileSync(readme, text.replace(/^# .*$/m, `# ${projectName}`))
  }

  const envExample = path.join(targetDir, "apps/api/.env.example")
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(targetDir, "apps/api/.env"))
  }
}
