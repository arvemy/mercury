---
name: verify-create-mercury
description: Pack and drive the real create-mercury CLI (`pnpm create mercury <name>`, source in cli/) in a real terminal, one isolated tmux session per drive, and capture transcripts, exit codes, and the generated project's files. Use to prove a change to cli/ or to anything that ships in the template works for someone creating a project, not just in Vitest.
---

# Verify create-mercury

The user-facing surface is the `create-mercury` CLI, which a user runs as `pnpm create mercury my-app`. It copies a snapshot of this repo into a new directory, names the project, runs `git init`, `pnpm install`, and an initial commit, then prints next steps. The web app and API inside the generated project are covered by the sibling `verify-mercury` skill.

All helpers live in `.agents/skills/verify-create-mercury/scripts/`. The examples assume `S=.agents/skills/verify-create-mercury/scripts`, run from the repo root.

## Launch

There is no server. Launch means packing the tarball a user would install, once per run.

```bash
S=.agents/skills/verify-create-mercury/scripts
eval "$($S/pack.sh)"      # prints `export VERIFY_CLI_RUN=<run dir>`; progress goes to stderr
```

- **Ready** means `pack.sh` exits 0 after printing `ready: <tarball> (<bytes> bytes)`.
- `pack.sh` runs `pnpm --dir cli pack`, whose `prepack` builds the CLI and rebuilds `cli/template/` from git-tracked files. The tarball includes uncommitted edits to tracked files, but not new untracked files. Commit or `git add -N` a new file before packing if the template should contain it.
- Each `drive.py` call then runs `pnpm dlx <tarball>` in a fresh work dir, inside its own tmux session on a tmux socket private to this run. Drives never share a directory or a terminal, so they can run one after another in the same run without cleanup between them.
- Re-pack (`pack.sh` again, which makes a new run) after changing `cli/` or anything in the template.

## Doctor

```bash
$S/doctor.sh              # uses $VERIFY_CLI_RUN; or pass the run dir
```

This check is read-only and exits 1 on any `FAIL`. It checks that the tarball exists and contains `dist/src/index.js`, `template/_gitignore`, and `template/package.json`, that the template excludes `cli/`, that `HEAD` still matches the packed commit, and that no tmux session from this run is still open. It prints a `note` line when the pack included modified tracked files.

Run it before the first drive, and again after any failed drive.

## Drive

`drive.py` runs one label per call. Each call gets `$VERIFY_CLI_RUN/work/<label>/` as its working directory, and each label can be used once per run.

```bash
$S/drive.py <label> '<step>' '<step>' ...
$S/drive.py --help                     # full step list
```

| Step | Meaning |
|---|---|
| `run [ARGS...]` | start `pnpm dlx <tarball> ARGS` in a real terminal (a TTY) |
| `run-piped [ARGS...]` | run it with stdin from `/dev/null`, no TTY, and wait for it to exit |
| `env KEY=VALUE` | add an env var to the next `run` or `run-piped`; `$WORK` expands to the work dir |
| `pre CMD` | run a shell command in the work dir before the CLI starts |
| `wait TEXT [SECONDS]` | wait until TEXT is on screen (default 60s) |
| `type TEXT` / `key KEY` | type text without Enter / send a tmux key such as `Enter` or `C-c` |
| `expect-exit CODE` | wait up to 300s for the CLI to exit, then check its exit code |
| `expect-text TEXT` / `expect-no-text TEXT` | the output so far does or does not contain TEXT |
| `expect-path PATH` / `expect-no-path PATH` | a path relative to the work dir exists or does not |
| `expect-cmd CMD EXPECTED` | `bash -c CMD` in the work dir prints exactly EXPECTED, trimmed |
| `snap NAME` | save the output so far as `NN-NAME.txt` |

These strings are stable in this CLI (`cli/src/index.ts`, `cli/src/scaffold.ts`):

- the prompt `Project name: `
- the success header `Done. Next steps:`, followed by `cd <name>`, `docker compose up -d db`, `pnpm db:migrate`, and `pnpm dev`
- the name rule `Project name must be lowercase and use only letters, digits, and - . _ ~`
- the non-empty refusal `<absolute path> already exists and is not empty.`
- the no-TTY usage line `Usage: pnpm create mercury <project-name>`
- the install failure `pnpm install failed. Run it again with:`
- the commit message `Initial commit from create-mercury`

Feature recipes are in [`features/README.md`](features/README.md). Use the matching feature file, and cover every entry point it lists.

## Evidence

Everything for a label goes to `$VERIFY_CLI_RUN/evidence/<label>/`:

- `steps.log`, with each step, the `exit N` line, and each `expect-cmd` result
- `NN-<name>.txt`, from each `snap`
- `transcript.txt`, the full terminal output at the end of a passing drive, or `FAILED.txt` on failure
- `tree.txt`, the work dir two levels deep, without `node_modules` and `.git`

`pack.log` stays in `$VERIFY_CLI_RUN/logs/`. Report proofs by pointing at these paths.

Proof standards:

- **Drive the real user path.** Use the packed tarball through `pnpm dlx`, as `pnpm create` does. Calling `scaffold()` directly is a unit test, not a proof.
- **Capture the action and the result.** Snap the prompt or error on screen, check the exit code, and check the files on disk.
- **Verify side effects.** Check the files, the git history, and the installed `node_modules` with `expect-cmd` and `expect-path`, not only the printed text.
- **Mock nothing.** Installs hit the real registry through the user's pnpm store. The offline recipe uses pnpm's own offline mode and an empty store to produce a real install failure.

## Cleanup

```bash
$S/down.sh                # uses $VERIFY_CLI_RUN; or pass the run dir. Safe to run twice.
```

`down.sh` kills this run's private tmux server, deletes `$VERIFY_CLI_RUN/work/` (the generated projects and their `node_modules`) and the tarball, and writes a `DOWN` marker. It **keeps** `evidence/` and `logs/`. Runs live under `~/.local/state/verify-create-mercury/runs/<run-id>/`. Override the location with `VERIFY_STATE_ROOT`.

Never kill tmux servers or pnpm processes by name. The user may be running their own. Run `down.sh` after failed attempts too.

## Helpers

| Script | Purpose |
|---|---|
| `pack.sh` | pack the CLI into a new run and print `export VERIFY_CLI_RUN=...` |
| `doctor.sh [run]` | read-only check of the tarball, `HEAD`, and leftover sessions |
| `drive.py <label> <steps...>` | terminal step runner with automatic evidence |
| `down.sh [run]` | kill this run's tmux server and delete generated projects, keeping evidence |
| `lib.sh` | shared paths, sourced by the others |
