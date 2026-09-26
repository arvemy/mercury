# Theme toggle

Pressing `d` anywhere outside a form field toggles between light and dark mode. The choice is stored in localStorage and survives navigation and reloads. The footer hint reads `(Press d to toggle dark mode)`.

## Sub-features

- `theme-toggle` switches the `<html>` class between `light` and `dark` on each `d` press.
- `theme-persist` stores the choice in `localStorage.theme` and keeps it across routes and reloads.
- `theme-editable-skip` does nothing while focus is in an `input` of any type, a `textarea`, a `select`, or a contenteditable element.

## How to get to it (user POV)

- Press `d` on any page while no form field is focused.

## Driving it with drive.py

Preconditions:

- A fresh browser session, which each `drive.py` call provides. The headless Chromium session defaults to the light system theme.

- **Toggle and modifiers.** Run:

  ```
  $S/drive.py theme-toggle 'goto /' 'expect-text "(Press d to toggle dark mode)"' 'expect-js "document.documentElement.className" light' 'expect-js "localStorage.getItem(\"theme\")" null' 'shot light' 'press d' 'expect-js "document.documentElement.className" dark' 'expect-js "localStorage.getItem(\"theme\")" dark' 'shot dark' 'press Control+d' 'press d' 'expect-js "document.documentElement.className" light' 'press Alt+d' 'press d' 'expect-js "document.documentElement.className" dark' 'press Shift+D' 'expect-js "document.documentElement.className" light'
  ```

  Each modifier press is followed by a plain `d`, so the class flips once only if the modifier press was ignored. `Shift+D` toggles.
- **Persist.** Run:

  ```
  $S/drive.py theme-persist 'goto /' 'press d' 'expect-js "document.documentElement.className" dark' 'click link Todos' 'expect-url /todos' 'expect-js "document.documentElement.className" dark' 'goto /todos' 'expect-js "document.documentElement.className" dark' 'shot todos-dark-after-reload' 'press d' 'goto /' 'expect-js "document.documentElement.className" light' 'expect-js "localStorage.getItem(\"theme\")" light'
  ```

  This covers an in-app route change and a full reload.
- **Editable field.** Run:

  ```
  $S/drive.py theme-editable-skip 'goto /todos' 'click textbox "New todo"' 'press d' 'expect-value textbox "New todo" d' 'expect-js "document.documentElement.className" light' 'shot typed-d' 'click heading Todos' 'press d' 'expect-js "document.documentElement.className" dark' 'shot dark-after-blur'
  ```

  The last press is the positive control. If the press inside the field had toggled, the run would end on `light` and fail.

## Gotchas

- `fill` sets the value without key events. Use `click` then `press` when the point is to prove that a keypress inside the input is ignored.
- `Control`, `Meta`, and `Alt` combinations and key repeats are ignored. `Shift` is not, so `Shift+D` and Caps Lock `D` toggle.
- After the first toggle the theme stays fixed. No UI returns it to following the system setting.
- Cross-tab sync (the `storage` event) and live system-theme changes exist in `theme-provider.tsx`, but `drive.py` cannot drive a second tab or change the emulated color scheme.
- Before any toggle, the theme follows `prefers-color-scheme`. Assert the starting class; don't assume it.
