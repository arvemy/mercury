# Mercury verification map

This directory is the maintained source for verifying what users see and do in the Mercury app. Read this index before driving the app. Then follow the matching feature file as the recipe. Commands assume `S=.agents/skills/verify-mercury/scripts`, run from the repo root.

## Baseline preconditions

- Start a fresh stack with `eval "$($S/up.sh)"`. It has an empty `todos` table, and each browser session starts with empty localStorage. The theme then follows the system setting, which headless Chromium reports as light.
- Run `$S/doctor.sh` and require every line to be `ok`.
- Never drive an instance that `up.sh` did not start in this run.

## Driving conventions

- Every recipe starts from the baseline unless its preconditions say otherwise.
- Use ARIA roles and exact accessible names through `drive.py`. Avoid CSS selectors and coordinates.
- Each `drive.py` call is a new browser session, and client state resets between calls. Keep a flow that depends on client state in one call.
- The DB persists for the whole run. After a mutating recipe, either run `down.sh` and `up.sh`, or write assertions that tolerate the earlier rows.

## Proof and skip reporting

- Name the evidence label after the feature ID, for example `todos-add`.
- UI proof needs a `shot` before and after the action, plus the `steps.log` pass line.
- Mutation proof also needs the `wait-response` status line, a `sql.sh` row dump, and a reload that shows the value again.
- API proof is the `api-N.txt` file, which holds the request, the body, and `HTTP <code>`.
- If you cannot reach an entry point, report the command you tried and the precondition that was missing. Do not report it as verified through some other path.

## Feature entry contract

Each feature file has an H1 and a one-paragraph description. Then come four H2s, in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with <helper>` naming `drive.py` or `api.sh` (starting with `Preconditions:`), and `Gotchas`.

## Features

- [Todos](./todos.md) covers the list, the empty state, adding a todo, blank-input rejection, and persistence.
- [Home and API status](./home-api-status.md) covers the landing page and its live `API:` indicator, including the unreachable state.
- [Navigation](./navigation.md) covers the Home/Todos nav links, active-link styling, and deep links.
- [Color scheme](./color-scheme.md) covers Mantine's native system color scheme and saved preferences.
- [HTTP API](./http-api.md) covers `/api/health`, `/api/hello`, and `/api/todos` as a secondary surface, with its validation errors.
