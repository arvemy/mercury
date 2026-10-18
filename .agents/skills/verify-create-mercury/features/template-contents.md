# Template contents

A generated project contains the Cloudflare Worker app, tooling, installed stack skills, and the user-facing CI workflow. Repository-only verification, release, and audit files stay out.

## Sub-features

- `template-includes` covers the web and API source, Cloudflare configuration, migrations, shared UI, root scripts, lockfile, hooks, and project README.
- `template-skills` covers every installed skill and its matching Claude Code link without a hardcoded skill count.
- `template-excludes` covers CLI source, verification skills, audit files, repository docs, Docker files, license files, and every GitHub file except `workflows/ci.yml`.
- `template-lockfile` covers a frozen install with no CLI workspace importer.

## How to get to it

Create a project, then inspect its files and run the generated project's checks.

## Driving it with drive.py

Preconditions:

Pack a fresh run and require its doctor to pass. Mark new template files with `git add -N` before packing.

```sh
$S/drive.py template-contents 'run app' 'wait "Done. Next steps:" 180' 'expect-exit 0' 'expect-path app/apps/web/cloudflare.config.ts' 'expect-path app/apps/api/drizzle' 'expect-path app/scripts/integration.mjs' 'expect-path app/scripts/verify-worker.mjs' 'expect-path app/packages/ui/src/theme.ts' 'expect-path app/.husky/pre-commit' 'expect-path app/skills-lock.json' 'expect-cmd "find app/.github -type f" app/.github/workflows/ci.yml' 'expect-cmd "head -1 app/README.md" "# app"' 'expect-cmd "for skill in app/.agents/skills/*; do test -f app/.claude/skills/$(basename $skill)/SKILL.md || exit 1; done; echo linked" linked' 'expect-no-path app/docker-compose.yml' 'expect-no-path app/apps/api/Dockerfile' 'expect-no-path app/apps/web/Dockerfile' 'expect-no-path app/apps/web/Caddyfile' 'expect-no-path app/.dockerignore' 'expect-no-path app/.audit' 'expect-no-path app/docs' 'expect-no-path app/cli' 'expect-no-path app/LICENSE' 'expect-no-path app/.agents/skills/verify-mercury' 'expect-no-path app/.agents/skills/verify-create-mercury' 'expect-cmd "cd app && pnpm install --frozen-lockfile --offline >/dev/null 2>&1 && echo frozen-ok" frozen-ok'
```

Run `cli/scripts/smoke.sh` for the complete credential-free generated-project check, including the built Worker HTTP check.

## Gotchas

The snapshot uses git-tracked files. A file on disk can still be absent from the tarball if Git does not know it. `.claude` is recreated from shipped `.agents/skills` with relative links, or copies on systems without symlink support.
