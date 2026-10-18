# HTTP API

The Worker routes `/api` to Hono before Static Assets. Health is public. Todo access requires a verified Neon Auth session, and each query uses the authenticated owner.

## Sub-features

The credential-free built check covers health, anonymous GET and POST HTTP 401 JSON responses, missing API HTTP 404 without SPA HTML, and missing asset HTTP 404. The live suite covers real authentication, database writes, ownership, and user isolation. Its isolated API suite covers greeting validation, malformed todo bodies, and ownership attacks.

## How to get to it

Use the web app's same-origin `/api` URLs. There is no separate Node API server or proxy port.

## Drive and inspect

Run `.agents/skills/verify-mercury/scripts/run.sh --public` and inspect `.audit/worker-smoke/checks.log`. Run the helper without `--public` for live proof, then inspect `api-integration.log`, `browser/network.log`, and `browser/database.json` in that run's evidence directory.

## Limits

Use the UI to register and sign in with real Neon Auth sessions. The browser calls `/api/auth/*` and `/api/todos` through same-origin cookies. Never inject users, bearer tokens, custom identity headers, or fabricated cookies as live proof. Network evidence records method, path, and status only. Auth response bodies and cookies contain credentials and must never enter evidence. Direct API checks complement clicking Add in the browser.
