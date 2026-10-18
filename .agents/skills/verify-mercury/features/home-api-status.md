# Public home and API status

`/` renders the public home page. Its API status reads the real Worker's `/api/health` response.

## Sub-features

The public built Worker check covers SPA responses and health HTTP 200. The live browser run confirms `API: ok` without a signed-in session and saves home screenshots.

## How to get to it

Open `/` or choose Home in the navigation.

## Drive and inspect

Run `.agents/skills/verify-mercury/scripts/run.sh --public` for built HTTP proof. Run the same helper without `--public` for browser proof. Inspect `.audit/worker-smoke/checks.log` and the live run's `browser/00-home-light.png` and ARIA snapshot.

## Limits

The API and frontend share one Worker. The retired separate-API kill recipe no longer applies. To test an unreachable remote service, introduce a real failure in the owned verification environment and add an assertion for the resulting behavior. Do not mock Neon Auth or substitute a successful health response.
