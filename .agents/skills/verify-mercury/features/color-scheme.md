# Color scheme

The app uses Mantine's native color-scheme system. It follows the system preference by default and reads saved preferences from `localStorage["mantine-color-scheme-value"]`.

## Sub-features

- `scheme-system` renders the system color scheme when no Mantine preference is saved.
- `scheme-persist` applies a saved Mantine preference across navigation and reloads.

## How to get to it (user POV)

- Open any page. Its colors follow your system preference.
- Components can use `useMantineColorScheme` to change or clear the saved preference.

## Driving it with drive.py

Preconditions:

- A fresh `up.sh` run with `doctor.sh` all `ok`.
- Each `drive.py` call opens a browser with empty localStorage and a light system preference.

- **System default.** Run:

  ```
  $S/drive.py scheme-system 'goto /' 'expect-js "document.documentElement.getAttribute(\"data-mantine-color-scheme\")" light' 'expect-js "localStorage.getItem(\"mantine-color-scheme-value\")" null' 'shot system-light'
  ```

- **Saved preference.** Seed Mantine's native storage key to exercise the provider's startup behavior:

  ```
  $S/drive.py scheme-persist 'goto /' 'expect-js "(localStorage.setItem(\"mantine-color-scheme-value\", \"dark\"), localStorage.getItem(\"mantine-color-scheme-value\"))" dark' 'goto /' 'expect-js "document.documentElement.getAttribute(\"data-mantine-color-scheme\")" dark' 'shot home-dark' 'click link Todos' 'expect-url /todos' 'expect-js "document.documentElement.getAttribute(\"data-mantine-color-scheme\")" dark' 'goto /todos' 'expect-js "document.documentElement.getAttribute(\"data-mantine-color-scheme\")" dark' 'shot todos-dark-after-reload'
  ```

## Gotchas

- Mantine applies `data-mantine-color-scheme` to `<html>`. Read that attribute when checking the effective scheme.
- `defaultColorScheme="auto"` follows `prefers-color-scheme` until an explicit Mantine preference is saved.
- To exercise live system changes, use Playwright's color-scheme emulation. The step runner defaults to a light system preference.
