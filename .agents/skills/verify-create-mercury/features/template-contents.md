# Template contents

A generated project contains the app, its tooling, and the user-facing CI workflow, and nothing that only matters to the Mercury repo. Its lockfile matches its workspace, so a frozen install succeeds.

## Sub-features

- `template-includes` ships `apps/` with both Dockerfiles and the `Caddyfile`, `packages/`, `turbo.json`, `docker-compose.yml` with the `prod` profile, `.dockerignore`, `.husky/pre-commit`, `.github/workflows/ci.yml`, and a project `README.md` from `cli/project-readme.md` titled with the project name.
- `template-skills` ships the third-party agent skills in `.agents/skills` with `skills-lock.json`, and the CLI links each one into `.claude/skills`.
- `template-excludes` leaves out `cli/`, the `verify-mercury` and `verify-create-mercury` skills, `LICENSE`, and everything in `.github/` except `workflows/ci.yml`, such as the release workflow, the community files, and `dependabot.yml`.
- `template-lockfile` has no `cli` importer and passes `pnpm install --frozen-lockfile --offline`.

## How to get to it (user POV)

- Run `pnpm create mercury my-app`, then look inside `my-app/`.

## Driving it with drive.py

Preconditions:

- A packed run with `doctor.sh` all `ok`, and network access for the install.

- **Contents and lockfile.** Run:

  ```
  $S/drive.py template-contents 'run app' 'wait "Done. Next steps:" 180' 'expect-exit 0' 'expect-path app/apps/web' 'expect-path app/apps/api' 'expect-path app/packages/ui' 'expect-path app/turbo.json' 'expect-path app/docker-compose.yml' 'expect-path app/.husky/pre-commit' 'expect-path app/apps/api/Dockerfile' 'expect-path app/apps/web/Dockerfile' 'expect-path app/apps/web/Caddyfile' 'expect-path app/.dockerignore' 'expect-cmd "jq -r .scripts.prod app/package.json" "docker compose --profile prod up --build --wait"' 'expect-cmd "find app/.github -type f" app/.github/workflows/ci.yml' 'expect-cmd "head -1 app/README.md" "# app"' 'expect-cmd "grep -c \"pnpm create mercury\" app/README.md" 0' 'expect-path app/skills-lock.json' 'expect-path app/.agents/skills/shadcn/SKILL.md' 'expect-cmd "readlink app/.claude/skills/shadcn" ../../.agents/skills/shadcn' 'expect-cmd "ls app/.agents/skills | LC_ALL=C sort | paste -sd," git-commit,semantic-versioning,shadcn,turborepo,vercel-composition-patterns,vercel-react-best-practices,vercel-react-view-transitions,web-design-guidelines,webapp-testing' 'expect-cmd "ls app/.claude/skills | wc -l" 9' 'expect-no-path app/.agents/skills/verify-mercury' 'expect-no-path app/.agents/skills/verify-create-mercury' 'expect-no-path app/.claude/skills/verify-mercury' 'expect-no-path app/cli' 'expect-no-path app/LICENSE' 'expect-cmd "grep -c \"^  cli:\" app/pnpm-lock.yaml" 0' 'expect-cmd "cd app && pnpm install --frozen-lockfile --offline >/dev/null 2>&1 && echo frozen-ok" frozen-ok'
  ```

## Gotchas

- `cli/scripts/snapshot.ts` holds the exclusion list in `EXCLUDED`. A new repo-only file or skill ships to users unless it is added there.
- `.claude/` is never copied from the repo. The CLI creates `.claude/skills/<name>` as a relative link to `../../.agents/skills/<name>` for every shipped skill, or a copy where symlinks are not allowed.
- The snapshot copies git-tracked files only. A new file that is not yet tracked is missing from the template even though it exists in the checkout.
- For a full build, test, and migration check of a generated project, run `cli/scripts/smoke.sh` with `DATABASE_URL` set. That is what the `create-mercury` CI workflow runs.
