# Navigation

A persistent top nav switches between Home and Todos without a full page load, highlights the active link, and every route also works as a direct deep link.

## Sub-features

- `nav-links` switches routes client-side through the `Home` and `Todos` links.
- `nav-active` renders the active link in the foreground color and the other link muted.
- `nav-deep-link` renders the right page when `/` or `/todos` is loaded directly.

## How to get to it (user POV)

- Choose `Home` or `Todos` in the nav at the top of every page.
- Type `/` or `/todos` into the address bar.

## Driving it with drive.py

Preconditions:

- A fresh `up.sh` run with `doctor.sh` all `ok`.

- **Links and active state.** Set a helper that reads which link has `aria-current="page"`, then run:

  ```
  ACT='expect-js "[...document.querySelectorAll(\"nav a\")].map(a => a.textContent + \":\" + (a.getAttribute(\"aria-current\") === \"page\" ? \"active\" : \"-\")).join()"'
  $S/drive.py nav-links 'goto /' 'expect heading "Project ready!"' "$ACT Home:active,Todos:-" 'shot home-active' 'expect-js "(window.__spa = 1)" 1' 'click link Todos' 'expect-url /todos' 'expect heading Todos' 'expect-js window.__spa 1' "$ACT Home:-,Todos:active" 'shot todos-active' 'click link Home' 'expect-url /' 'expect-js window.__spa 1' "$ACT Home:active,Todos:-" 'shot back-home'
  ```

  `window.__spa` survives each click, which proves no full page load happened. The screenshots show the active link darker than the other one.
- **Deep link.** Run `$S/drive.py nav-deep-link 'goto /todos' 'expect heading Todos' 'expect link Home' 'expect link Todos' "$ACT Home:-,Todos:active" 'shot deep-todos' 'goto /' 'expect heading "Project ready!"' "$ACT Home:active,Todos:-"`.

## Gotchas

- Unknown paths such as `/nope` have no custom 404 route. TanStack Router renders its default "Not Found" inside the layout, so don't treat that page as a feature.
- Links preload on hover (`defaultPreload: "intent"`). Hovering `Todos` fires `GET /api/todos` before the click, so don't count requests on the assumption that the click sent the first one.
