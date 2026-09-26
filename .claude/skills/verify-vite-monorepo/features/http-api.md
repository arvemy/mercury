# HTTP API

The Hono API under `/api` is what the web app talks to, and it is also usable directly. It has a health check, a greeting endpoint, and endpoints to list and create todos, with zod validation that returns 400 on bad input.

## Sub-features

- `api-health`: `GET /api/health` returns `{"status":"ok"}`.
- `api-hello`: `GET /api/hello?name=Ada` returns `{"message":"Hello, Ada!"}`. A missing, empty, or repeated `name` returns 400.
- `api-todos-list`: `GET /api/todos` returns all rows ordered by id.
- `api-todos-create`: `POST /api/todos {"title":...}` returns 201 with the row. An empty, missing, or non-string title returns 400, and so does a body that is not valid JSON.

## How to get to it (user POV)

- Send HTTP requests to `$WEB_URL/api/...` through the Vite proxy, which is what the browser does.
- Or send them to `$API_URL/api/...` directly.

## Driving it with api.sh

Preconditions:

- A fresh `up.sh` run with `doctor.sh` all `ok`.

- **Health.** `$S/api.sh api GET /api/health` returns `HTTP 200` and `{"status":"ok"}`. Direct to the API, `curl -sS "$API_URL/api/health"` returns the same body after `source "$VERIFY_RUN/state.env"`.
- **Hello.** `$S/api.sh api GET '/api/hello?name=Ada'` returns `HTTP 200` and `{"message":"Hello, Ada!"}`. `GET /api/hello`, `GET '/api/hello?name='`, and `GET '/api/hello?name=a&name=b'` each return `HTTP 400` with a `ZodError` body.
- **Create.** `$S/api.sh api POST /api/todos '{"title":"From API"}'` returns `HTTP 201` with `id`, `title`, `completed:false`, and `createdAt`.
- **Create invalid.** `'{"title":""}'`, `'{}'`, and `'{"title":123}'` each return `HTTP 400` with a `ZodError` body. `'{'` returns `HTTP 400` with the plain text `Malformed JSON in request body`.
- **Unknown fields.** `'{"title":"x","completed":true}'` returns `HTTP 201` with `completed:false`.
- **Unknown method.** `$S/api.sh api DELETE /api/todos` returns `HTTP 404` and `404 Not Found`.
- **List.** `$S/api.sh api GET /api/todos` returns a JSON array ordered by `id` that contains `From API`.
- **Side effect.** `$S/sql.sh api 'select title from todos'` contains `From API`. `grep -F -- '--> POST /api/todos 201' "$VERIFY_RUN/logs/api.log"` finds the request.

## Gotchas

- Unknown body fields are dropped silently: `{"title":"x","completed":true}` creates a row with `completed:false`. That is intended, because the insert schema picks only `title`.
- Validation errors are `{"success":false,"error":{"name":"ZodError","message":"..."}}` with status 400. The `message` field is the list of issues serialized as a JSON string, so codes such as `too_small` appear only inside that string. There is no `issues` key.
- A request with no JSON `content-type` is validated as if its body were `{}`.
- Unknown routes and methods return 404, never 405.
- `api.sh` proves the API surface only. It doesn't count as UI proof for [Todos](./todos.md).
