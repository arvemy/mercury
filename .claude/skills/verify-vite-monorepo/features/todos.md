# Todos

The Todos page lists saved todos and lets a user add one by typing a title and pressing Add. The list refreshes from the server afterward, and the input clears. Blank titles are ignored.

## Sub-features

- `todos-empty` shows `No todos yet.` when there are no rows.
- `todos-add` saves a trimmed title, clears the input, and shows the new item in the list.
- `todos-blank` does nothing, and sends no request, when the title is empty or only whitespace.
- `todos-persist` shows saved todos again after a reload, because the list comes from the DB.

## How to get to it (user POV)

- Choose `Todos` in the top nav from any page.
- Open `/todos` directly.
- Submit the form either by choosing `Add` or by pressing `Enter` in the `New todo` textbox.

## Driving it with drive.py

Preconditions:

- A fresh `up.sh` run, with `doctor.sh` reporting `todos table has 0 rows`.

- **Empty state.** Run `$S/drive.py todos-empty 'goto /' 'click link Todos' 'expect-url /todos' 'expect heading Todos' 'expect-text "No todos yet."' 'shot empty'`.
- **Add, trim, and Enter.** Run `$S/drive.py todos-add 'goto /todos' 'fill textbox "New todo" "  Buy milk  "' 'shot typed' 'wait-response POST /api/todos && click button Add' 'expect-text "Buy milk"' 'expect-no-text "No todos yet."' 'expect-value textbox "New todo" ""' 'shot added' 'fill textbox "New todo" "Walk dog"' 'wait-response POST /api/todos && press Enter' 'expect-text "Walk dog"' 'shot added-enter'`.
  `steps.log` shows `POST /api/todos -> 201` twice. In `network.log`, the first POST's request is `{"title":"Buy milk"}`, which proves the trim.
- **Blank ignored.** Run `$S/drive.py todos-blank 'goto /todos' 'click button Add' 'fill textbox "New todo" "   "' 'click button Add' 'press Enter' 'expect-value textbox "New todo" "   "' 'shot after'`.
  This covers an empty and a whitespace-only title. Then `grep -c '"POST"' $VERIFY_RUN/evidence/todos-blank/network.log` prints `0`.
- **Persist.** Run `$S/drive.py todos-persist 'goto /todos' 'expect-text "Buy milk"' 'expect-text "Walk dog"' 'expect-no-text done' 'shot reloaded'`. A new browser session proves the list came from the server.
- **DB side effect.** Run `$S/sql.sh todos-persist 'select id, title, length(title) as len, completed from todos order by id'`.
  It shows `1 | Buy milk | 8 | f` and `2 | Walk dog | 8 | f`. The length of 8 proves the trimmed title was stored.

## Gotchas

- `expect-text` is an exact, full-text match. List items render the title alone, and the text `done` appears as a separate span only when `completed` is true.
- The UI cannot mark a todo complete, and `POST /api/todos` ignores `completed`: the API accepts only `title`. Every todo created here shows no `done` label.
- Blank rejection happens only in the browser. The API accepts a whitespace-only title such as `"   "`.
- A failed POST shows no error in the UI.
- There is no delete in the UI or the API. To get back to an empty list, run `down.sh` and then `up.sh`.
- `Add` stays disabled until the POST and the list refetch after it both finish. Use `wait-response` rather than asserting the disabled state, and follow it with an `expect-text` for the new item before the next submit.
- The TanStack Router and Query devtools buttons sit in the bottom corners in dev. They appear in ARIA snapshots and screenshots. Ignore them.
