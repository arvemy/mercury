# Navigation and route protection

Home stays public. Todos requires a Neon Auth session. Both routes support direct navigation through the single Worker's SPA fallback.

## Sub-features

The public check covers `/`, `/todos`, `/sign-in`, and `/sign-up` as built SPA routes. The live runner covers anonymous protection, signed-in Home and Todos links, reload persistence, and protection after sign-out.

## How to get to it

Open the route directly or use the Home and Todos links. A signed-out Todos visit reaches the sign-in flow.

## Drive and inspect

Run the parent skill's public and live commands. Inspect the HTTP checks and `browser/01-anonymous`, `02-owner-before`, and `06-signed-out` evidence. A signed-out browser must not contain the New todo textbox, and its todo API call must return HTTP 401.

## Limits

An HTTP 200 SPA document alone does not prove route authorization. The browser and authenticated API checks are required for that claim. If a change affects active link styling or client-side navigation behavior, add those assertions to `scripts/neon-auth-e2e.mjs` and capture the relevant states.
