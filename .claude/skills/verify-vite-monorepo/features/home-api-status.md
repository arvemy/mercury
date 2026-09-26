# Home and API status

The home page greets the user and shows whether the backend is reachable. The line reads `API: ok` when `/api/health` responds, `API: ...` while it loads, and `API: unreachable` once the request has failed.

## Sub-features

- `home-render` shows the heading `Project ready!`, the intro text, and a demo `Button`.
- `home-api-ok` shows `API: ok` when the API is healthy.
- `home-api-unreachable` shows `API: unreachable` when the API is down.

## How to get to it (user POV)

- Open `/`.
- Choose `Home` in the top nav from any page.

## Driving it with drive.py

Preconditions:

- A fresh `up.sh` run. `doctor.sh` is all `ok` for the healthy checks.

- **Render and healthy status.** Run `$S/drive.py home 'goto /' 'expect heading "Project ready!"' 'expect button Button' 'expect-text "API: ok"' 'shot healthy'`.
  `network.log` shows `GET /api/health` with status 200.
- **Via nav.** Run `$S/drive.py home-nav 'goto /todos' 'click link Home' 'expect-url /' 'expect-text "API: ok"'`.
- **Unreachable.** Do this last, because it breaks the run. Stop only this run's API with `source $VERIFY_RUN/state.env; kill -TERM -- -$API_PGID`. Then run `$S/drive.py home-unreachable 'goto /' 'expect-text "API: unreachable"' 'shot unreachable'`.
  `doctor.sh` now reports `FAIL API process group ... is gone` and a 502 through the proxy. Afterward, run `down.sh`. There is no in-place API restart.

## Gotchas

- `API: unreachable` appears only after React Query's 3 retries, about 7s. `drive.py`'s 15s timeout covers that. Don't lower it.
- With the API down, Vite's proxy returns 502 and logs `http proxy error` in `logs/web.log`. That is expected.
- The `Button` on the home page does nothing. It is a shadcn demo, so don't verify a click result.
