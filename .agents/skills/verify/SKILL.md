---
name: verify
description: Prove a Mercury change works in the real product. Mercury has two surfaces. One is the web app at / and /todos with its Hono /api and Postgres, driven in a browser by verify-mercury. The other is the create-mercury CLI, driven in a terminal by verify-create-mercury. This skill picks the surface from the files a change touches and runs that skill's launch, doctor, drive, evidence, and cleanup steps. Use it before you call a web, API, CLI, or template change done.
---

# Verify

Mercury has two user-facing surfaces, and each one has its own driver skill. This skill picks the driver. The full instructions and the feature maps are in the driver skills.

| Change touches | Surface | Driver skill |
|---|---|---|
| `apps/web`, `apps/api`, `packages/ui`, migrations | Web app in a browser, plus `/api` and Postgres | [`verify-mercury`](../verify-mercury/SKILL.md) |
| `cli/`, or a file that ships in the template, such as a root config, `.agents/skills`, or `skills-lock.json` | `pnpm create mercury` in a terminal | [`verify-create-mercury`](../verify-create-mercury/SKILL.md) |
| Both, such as a new dependency in `apps/web` | Both surfaces | Drive both. Start with `verify-mercury`. |

The template is every git-tracked file except `cli/`, `.claude/`, the license files, the verify skills, and most of `.github/` (see `EXCLUDED` in `cli/scripts/snapshot.ts`). A change to the web app is also a change to every generated project.

Read the driver's `SKILL.md` and its `features/README.md` before the first drive. The commands below assume you run them from the repo root.

## Launch

```bash
W=.agents/skills/verify-mercury/scripts
eval "$($W/up.sh)"          # web: isolated Postgres, API, and Vite on free ports; exports VERIFY_RUN

C=.agents/skills/verify-create-mercury/scripts
eval "$($C/pack.sh)"        # CLI: packs the tarball a user installs; exports VERIFY_CLI_RUN
```

Each command is ready when it exits 0 and prints a `ready:` line. Neither touches the user's `pnpm dev` stack, the `docker compose` database, or ports 3000, 5173, and 5432.

## Doctor

```bash
$W/doctor.sh                # web: process groups, port ownership, DB, proxy health, browser, HEAD
$C/doctor.sh                # CLI: tarball contents, HEAD, leftover tmux sessions
```

Both are read-only and exit 1 on any `FAIL`. Run the doctor before the first drive and again after anything odd. Never patch a half-dead run. Tear it down and launch again.

## Drive

```bash
$W/drive.py <label> 'goto /todos' 'fill textbox "New todo" Milk' 'wait-response POST /api/todos && click button Add' 'shot after'
$C/drive.py <label> 'run my-app' 'wait "Done. Next steps:" 300' 'expect-exit 0'
```

- The web `drive.py` is a `uv` script. It needs `uv` and the Chromium build that its doctor checks.
- The CLI `drive.py` needs `tmux`.
- Pick the recipe from the driver's feature map, and cover every entry point the feature file lists.

## Evidence

- Web evidence goes to `$VERIFY_RUN/evidence/<label>/`: screenshots, ARIA snapshots, `network.log`, `console.log`, and the output of `api.sh` and `sql.sh`.
- CLI evidence goes to `$VERIFY_CLI_RUN/evidence/<label>/`: `steps.log`, `transcript.txt`, and `tree.txt`.
- Both drivers hold proofs to the same standard. Drive the real user path, capture the state before and after, check side effects such as DB rows or files on disk, and mock nothing.
- Report a proof by its evidence paths.

## Cleanup

```bash
$W/down.sh                  # stops this run's processes and Postgres, keeps evidence/ and logs/
$C/down.sh                  # kills this run's tmux server, deletes generated projects, keeps evidence/ and logs/
```

Runs stay under `~/.local/state/verify-mercury/runs/` and `~/.local/state/verify-create-mercury/runs/`. Run `down.sh` after failed attempts too. Never kill processes by name or by port.

## Helpers

This skill ships no scripts. Every helper lives in a driver's `scripts/` directory, and each driver's `SKILL.md` documents its helpers in a table.
