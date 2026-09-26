# Sourced by the other scripts. Not executable on its own.

SKILL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
STATE_ROOT=${VERIFY_STATE_ROOT:-${XDG_STATE_HOME:-$HOME/.local/state}/verify-vite-monorepo}
PG_VERSION=17.10.0-beta.17
PG_CACHE=${VERIFY_PG_CACHE:-$HOME/.cache/verify-vite-monorepo/pg17}
PG_BIN=$PG_CACHE/node_modules/@embedded-postgres/linux-x64/native/bin

die() { echo "error: $*" >&2; exit 1; }

# Resolve the run dir from $1 or $VERIFY_RUN and load its state.env.
load_run() {
  RUN=${1:-${VERIFY_RUN:-}}
  [ -n "$RUN" ] || die "no run given: pass the run dir or export VERIFY_RUN (printed by up.sh)"
  [ -f "$RUN/state.env" ] || die "$RUN/state.env not found"
  # shellcheck disable=SC1091
  source "$RUN/state.env"
}

free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'
}

pgid_alive() { [ -n "${1:-}" ] && kill -0 -- "-$1" 2>/dev/null; }
