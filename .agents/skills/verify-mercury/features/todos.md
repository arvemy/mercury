# Private todos

A signed-in user creates a trimmed title and sees only todos owned by that Neon Auth user. Signing out removes access.

## Sub-features

The live suite covers anonymous protection, the empty todo form for a fresh user, adding a trimmed title through Add, clearing the input, persistence after reload, a second user's isolation, the real Neon row's `ownerId`, and sign-out. The API suite covers blank titles, malformed payloads, and attempts to supply ownership.

## How to get to it

Open `/todos` or choose Todos in the navigation. A signed-out visitor goes to Neon Auth sign-in. After signing in, use New todo and Add.

## Drive and inspect

Run `.agents/skills/verify-mercury/scripts/run.sh` with the Neon Postgres and Neon Auth test configuration from the parent skill. Inspect `browser/02-owner-before`, `03-owner-after`, `04-owner-reloaded`, `05-other-user`, and `06-signed-out` PNG and ARIA files. `checks.log` records POST 201 and cross-user isolation. `database.json` must have exactly the created title and its creator's Neon Auth ID.

## Limits

The UI has no delete or completion control. Never reset a shared database to obtain an empty state. The run creates fresh users and deletes only its own branch afterward. Add a browser assertion in `scripts/neon-auth-e2e.mjs` when a change introduces another user entry point, such as Enter submission or a new edit control.
