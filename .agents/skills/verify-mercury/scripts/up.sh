#!/usr/bin/env bash
# Start an isolated stack: throwaway Postgres 17 + migrated schema, API (tsx watch),
# and Vite web dev server, all on free ports. Prints `export VERIFY_RUN=<dir>`.
# Usage: up.sh
set -euo pipefail
source "$(dirname "$0")/lib.sh"

if [ ! -x "$PG_BIN/pg_ctl" ]; then
  echo "installing Postgres binaries into $PG_CACHE (one time)" >&2
  npm install --prefix "$PG_CACHE" --no-save --no-package-lock --silent "embedded-postgres@$PG_VERSION" >&2
fi
[ -d "$REPO/node_modules" ] || (cd "$REPO" && pnpm install --frozen-lockfile >&2)

RUN_ID=$(date +%Y%m%d-%H%M%S)-$$
RUN=$STATE_ROOT/runs/$RUN_ID
mkdir -p "$RUN"/{logs,evidence,scratch}

PG_PORT=$(free_port)
API_PORT=$(free_port)
WEB_PORT=$(free_port)
DATABASE_URL=postgresql://postgres@127.0.0.1:$PG_PORT/app

write_state() {
  {
    for v in RUN_ID RUN REPO PG_BIN PG_PORT API_PORT WEB_PORT DATABASE_URL API_PGID WEB_PGID GIT_HEAD; do
      printf '%s=%q\n' "$v" "${!v:-}"
    done
    printf 'API_URL=%q\nWEB_URL=%q\n' "http://127.0.0.1:$API_PORT" "http://127.0.0.1:$WEB_PORT"
  } > "$RUN/state.env"
}
GIT_HEAD=$(git -C "$REPO" rev-parse --short HEAD)
write_state

# Tear down whatever already started if a later step fails.
trap 'echo "up failed; see $RUN/logs" >&2; "$SKILL_DIR/scripts/down.sh" "$RUN" >&2 || true' ERR

"$PG_BIN/initdb" -D "$RUN/scratch/pgdata" -U postgres --auth=trust -E UTF8 > "$RUN/logs/initdb.log" 2>&1
"$PG_BIN/pg_ctl" -D "$RUN/scratch/pgdata" -l "$RUN/logs/postgres.log" -w \
  -o "-p $PG_PORT -h 127.0.0.1 -c unix_socket_directories=''" start > /dev/null
psql -q -h 127.0.0.1 -p "$PG_PORT" -U postgres -d postgres -c 'create database app'

(cd "$REPO/apps/api" && DATABASE_URL=$DATABASE_URL node_modules/.bin/drizzle-kit migrate) \
  > "$RUN/logs/migrate.log" 2>&1

# setsid makes each child its own process group so down.sh kills exactly what we started.
(cd "$REPO/apps/api" && NO_COLOR=1 PORT=$API_PORT DATABASE_URL=$DATABASE_URL \
  exec setsid node_modules/.bin/tsx watch src/index.ts) > "$RUN/logs/api.log" 2>&1 < /dev/null &
API_PGID=$!
(cd "$REPO/apps/web" && VERIFY_API_PORT=$API_PORT \
  exec setsid node_modules/.bin/vite --config "$SKILL_DIR/scripts/vite.verify.config.mts" \
  --host 127.0.0.1 --port "$WEB_PORT" --strictPort) > "$RUN/logs/web.log" 2>&1 < /dev/null &
WEB_PGID=$!
write_state

wait_for() { # url, name
  for _ in $(seq 120); do
    curl -fsS -o /dev/null "$1" 2>/dev/null && return 0
    sleep 0.5
  done
  echo "$2 did not answer $1 within 60s" >&2
  return 1
}
wait_for "http://127.0.0.1:$API_PORT/api/health" api
wait_for "http://127.0.0.1:$WEB_PORT/" web
wait_for "http://127.0.0.1:$WEB_PORT/api/health" "web -> api proxy"
trap - ERR

echo "ready: web http://127.0.0.1:$WEB_PORT  api http://127.0.0.1:$API_PORT  db $DATABASE_URL" >&2
echo "export VERIFY_RUN=$RUN"
