# Mercury verification map

Run `scripts/run.sh --public` from the parent skill directory for built Worker routes, headers, caching, and anonymous authorization. Run `scripts/run.sh` for real Neon Postgres and Neon Auth sessions. Use `--deployed` for an owned HTTPS Worker and actual Hyperdrive binding. Read the parent skill for each mode's configuration.

The live runners create their own branch, browser contexts, and users. Deployed mode creates a unique Worker, Hyperdrive configuration, and restricted SQL runtime role. Never drive the user's running app or reuse a production database.

Read the feature recipe that matches the change.

- [Authentication](authentication.md) covers signup, signin, reload, signout, manual real-inbox checks, and deployed sessions.
- [Todos](todos.md) covers private creation, trimming, persistence, ownership, and isolation.
- [Home and API status](home-api-status.md) covers public home and health.
- [Navigation](navigation.md) covers authenticated navigation and anonymous protection.
- [Color scheme](color-scheme.md) covers Mantine's system default and saved preference.
- [HTTP API](http-api.md) covers public health, JSON 401 responses, validation, and routing.

Local live evidence is `.audit/integration-<timestamp>/`. Deployed evidence is `.audit/deployed-<timestamp>/`. UI proof needs before and after screenshots, the observed HTTP status, and the saved database row. Check email delivery separately with the manual real-inbox recipe. Deployed proof needs exact resource IDs, restricted SQL grants, disabled Hyperdrive caching, and 404 deletion readbacks. `PASS` requires successful behavior and cleanup.

For preview transport changes, run the parent's two Node transport tests and the built `pnpm test:preview-transport` check. Report missing prerequisites or incomplete checks as missing proof, never as a pass. A workers.dev pass does not prove custom-domain DNS or TLS.
