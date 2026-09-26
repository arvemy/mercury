---
name: verify-mercury
description: Launch and drive the real Mercury app (React web UI at / and /todos, backed by the Hono /api and Postgres) in an isolated throwaway stack, then capture screenshots, ARIA snapshots, network, and DB evidence. Use to prove a web or API change works end to end in the running app, not just in Vitest.
---

# Verify Mercury

The user-facing surface is the **web UI** (`apps/web`, Vite + React + TanStack Router). It calls the **Hono API** (`apps/api`, routes under `/api`) through Vite's `/api` proxy, and the API stores data in **Postgres** via Drizzle. The API is a secondary surface, reachable with curl.

Every run is isolated. `up.sh` creates a fresh Postgres 17 data dir, applies the repo's Drizzle migrations, and starts the API (`tsx watch`) and Vite on free ports. It never touches the `docker compose` database, `apps/api/.env`, or ports 3000/5173/5432. Concurrent runs don't collide. Never drive a server you didn't start with `up.sh`, such as the user's `pnpm dev`.

All helpers live in `.agents/skills/verify-mercury/scripts/`. The examples below assume `S=.agents/skills/verify-mercury/scripts`, run from the repo root.

## Launch

```bash
S=.agents/skills/verify-mercury/scripts
eval "$($S/up.sh)"        # prints `export VERIFY_RUN=<run dir>`; progress goes to stderr
```

- **Ready** means `up.sh` exits 0 after printing `ready: web http://127.0.0.1:<port> ...`. It waits until `GET /api/health` answers on the API port, `/` answers on the web port, and `/api/health` answers through the web proxy (up to 60s each).
- **First run** installs the Postgres binaries (`embedded-postgres@17.10.0-beta.17`, about 30 MB) into `~/.cache/verify-mercury/pg17`. If `node_modules` is missing, it also runs `pnpm install --frozen-lockfile`. Docker is not needed.
- **On failure** `up.sh` tears down whatever it had started and names the logs dir. Read `$VERIFY_RUN/logs/{initdb,postgres,migrate,api,web}.log`.
- `$VERIFY_RUN/state.env` holds `WEB_URL`, `API_URL`, `DATABASE_URL`, the ports, `API_PGID`, `WEB_PGID`, and `GIT_HEAD`. Run `source "$VERIFY_RUN/state.env"` to use them.
- Both dev servers hot-reload source edits under `apps/`. Restart the run (`down.sh`, then `up.sh`) after changing the schema, migrations, dependencies, or `vite.config.ts`.
- Vite loads the repo config through `scripts/vite.verify.config.mts`. This verification-only wrapper changes only the `/api` proxy target and the root, because the repo config hardcodes `localhost:3000`.

## Doctor

```bash
$S/doctor.sh              # uses $VERIFY_RUN; or pass the run dir
```

This check is read-only and exits 1 on any `FAIL`. It checks that:

- the API and web process groups are alive;
- each port is owned by *this run's* process group, not someone else's server;
- Postgres is up and the `todos` table is queryable (it prints the row count);
- `/api/health` through the web proxy returns `{"status":"ok"}`;
- `HEAD` still matches the commit the run started on.

Run it first, and again whenever a step behaves oddly. If it fails, read the logs, then `down.sh` and `up.sh`. Don't patch a half-dead run.

## Drive

**Browser:** `drive.py` runs headless Chromium through Python Playwright, which is installed here. Each invocation is one fresh browser session with empty localStorage, running the steps in order and stopping at the first failure.

```bash
$S/drive.py <label> '<step>' '<step>' ...
$S/drive.py --help                     # full step list
```

| Step | Meaning |
|---|---|
| `goto PATH` | open `WEB_URL+PATH`, wait for network idle |
| `click ROLE NAME` / `fill ROLE NAME VALUE` | act on an element by ARIA role + exact accessible name |
| `press KEY` | keyboard press on the page (`d`, `Enter`) |
| `expect ROLE NAME` / `expect-text TEXT` / `expect-no-text TEXT` | visibility assertions (exact match, 15s timeout) |
| `expect-value ROLE NAME VALUE` | a form control's value |
| `expect-url PATH` | current path |
| `expect-js JS VALUE` | `String(JS) === VALUE`, for DOM/localStorage state |
| `wait-response METHOD PATH && <action>` | arm a response wait around the action that triggers it; logs the status |
| `shot NAME` | full-page PNG plus ARIA snapshot |

These handles are stable in this app:

- nav links `link Home` and `link Todos`
- headings `heading "Project ready!"` and `heading Todos`
- the todo input `textbox "New todo"` (placeholder `What needs doing?`) and the `button Add`
- the text `API: ok|...|unreachable`
- the empty-state text `No todos yet.`

**API:** `api.sh <label> METHOD PATH [json]` calls through the web proxy, which is the same path the browser uses.

**DB:** `sql.sh <label> "<sql>"` runs the query in a read-only transaction.

```bash
$S/api.sh todos-api POST /api/todos '{"title":"Buy milk"}'
$S/sql.sh todos-add 'select id, title, completed from todos order by id'
```

Feature recipes are in [`features/README.md`](features/README.md). Use the matching feature file, and cover every entry point it lists.

## Evidence

Everything for a label goes to `$VERIFY_RUN/evidence/<label>/`:

- `steps.log`: each step and its result, including `POST /api/todos -> 201` lines.
- `NN-<name>.png` and `NN-<name>.aria.txt` from each `shot`.
- `FAILED.png` when a step fails.
- `network.log`: one JSON line per `/api/*` response, with method, URL, status, request body, and response body.
- `console.log`: browser console output and page errors.
- `api-N.txt` and `db-N.txt` from `api.sh` and `sql.sh`.

Server logs stay in `$VERIFY_RUN/logs/`. `api.log` has Hono's request log lines (`--> POST /api/todos 201`). Report proofs by pointing at these paths.

Proof standards:

- **Drive the real user path:** click `Add` in the UI. `api.sh` is not a substitute for the UI entry point. Use it only to prove the API surface itself.
- **Capture before and after:** shoot the state before the action, the action (`wait-response` status), and the resulting state.
- **Verify side effects:** after a mutation, capture the row with `sql.sh`, and reload the page (`goto` again) to show it came from the server, not client cache.
- **Mock nothing:** the stack is real end to end. The DB is disposable, so mutate freely.
- **Check `console.log`** for `[pageerror]` lines. React Query/Router devtools noise is expected in dev.

## Cleanup

```bash
$S/down.sh                # uses $VERIFY_RUN; or pass the run dir. Safe to run twice.
```

`down.sh` kills only the process groups recorded in `state.env` and stops that run's Postgres with `pg_ctl`. It then deletes `$VERIFY_RUN/scratch`, which holds the DB data, and writes a `DOWN` marker.

It **keeps** `$VERIFY_RUN/evidence/` and `$VERIFY_RUN/logs/`. Runs live under `~/.local/state/verify-mercury/runs/<run-id>/`. Override the location with `VERIFY_STATE_ROOT`.

Never `pkill node`, `pkill vite`, or kill by port. The user may have their own dev servers running. Run `down.sh` after failed attempts too.

## Helpers

| Script | Purpose |
|---|---|
| `up.sh` | start an isolated stack and print `export VERIFY_RUN=...` |
| `doctor.sh [run]` | read-only health and ownership check |
| `drive.py <label> <steps...>` | browser step runner with automatic evidence |
| `api.sh <label> METHOD PATH [json]` | curl through the web proxy and save the request and response |
| `sql.sh <label> "<sql>"` | read-only query against the run DB and save the output |
| `down.sh [run]` | stop this run and keep its evidence |
| `lib.sh` | shared paths, sourced by the others |
| `vite.verify.config.mts` | Vite config wrapper that retargets the `/api` proxy |
