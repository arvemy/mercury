# Template contents

A generated project contains the app, its tooling, and the user-facing CI workflow, and nothing that only matters to the Mercury repo. Its lockfile matches its workspace, so a frozen install succeeds.

## Sub-features

- `template-includes` ships `apps/`, `packages/`, `turbo.json`, `docker-compose.yml`, `.husky/pre-commit`, `.github/workflows/ci.yml`, and the Mercury `README.md`.
- `template-excludes` leaves out `cli/`, `.claude/`, `.agents/`, `skills-lock.json`, `LICENSE`, `.github/workflows/release.yml`, and `.github/workflows/create-mercury.yml`.
- `template-lockfile` has no `cli` importer and passes `pnpm install --frozen-lockfile --offline`.

## How to get to it (user POV)

- Run `pnpm create mercury my-app`, then look inside `my-app/`.

## Driving it with drive.py

Preconditions:

- A packed run with `doctor.sh` all `ok`, and network access for the install.

- **Contents and lockfile.** Run:

  ```
  $S/drive.py template-contents 'run app' 'wait "Done. Next steps:" 180' 'expect-exit 0' 'expect-path app/apps/web' 'expect-path app/apps/api' 'expect-path app/packages/ui' 'expect-path app/turbo.json' 'expect-path app/docker-compose.yml' 'expect-path app/.husky/pre-commit' 'expect-cmd "ls app/.github/workflows" ci.yml' 'expect-cmd "head -1 app/README.md" "# Mercury"' 'expect-no-path app/cli' 'expect-no-path app/.claude' 'expect-no-path app/.agents' 'expect-no-path app/skills-lock.json' 'expect-no-path app/LICENSE' 'expect-cmd "grep -c \"^  cli:\" app/pnpm-lock.yaml" 0' 'expect-cmd "cd app && pnpm install --frozen-lockfile --offline >/dev/null 2>&1 && echo frozen-ok" frozen-ok'
  ```

## Gotchas

- `cli/scripts/snapshot.ts` holds the exclusion list in `EXCLUDED`. A new repo-only file at the root ships to users unless it is added there.
- The snapshot copies git-tracked files only. A new file that is not yet tracked is missing from the template even though it exists in the checkout.
- For a full build, test, and migration check of a generated project, run `cli/scripts/smoke.sh` with `DATABASE_URL` set. That is what the `create-mercury` CI workflow runs.
