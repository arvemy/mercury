# shellcheck shell=bash disable=SC2034
# Sourced by the other scripts. Not executable on its own.

SKILL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
REPO=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
STATE_ROOT=${VERIFY_STATE_ROOT:-${XDG_STATE_HOME:-$HOME/.local/state}/verify-create-mercury}

die() { echo "error: $*" >&2; exit 1; }

# Resolve the run dir from $1 or $VERIFY_CLI_RUN and load its state.env.
load_run() {
  RUN=${1:-${VERIFY_CLI_RUN:-}}
  [ -n "$RUN" ] || die "no run given: pass the run dir or export VERIFY_CLI_RUN (printed by pack.sh)"
  [ -f "$RUN/state.env" ] || die "$RUN/state.env not found"
  # shellcheck disable=SC1091
  source "$RUN/state.env"
}
