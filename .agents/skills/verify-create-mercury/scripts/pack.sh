#!/usr/bin/env bash
# Pack create-mercury from this checkout into a fresh run dir.
# Prints `export VERIFY_CLI_RUN=<dir>`; progress goes to stderr.
# Usage: pack.sh
set -euo pipefail
source "$(dirname "$0")/lib.sh"

for tool in pnpm git tmux jq; do
  command -v "$tool" >/dev/null || die "$tool is not on PATH"
done

RUN_ID=$(date +%Y%m%d-%H%M%S)-$$
RUN=$STATE_ROOT/runs/$RUN_ID
mkdir -p "$RUN/logs" "$RUN/evidence" "$RUN/work"

[ -d "$REPO/node_modules" ] || (cd "$REPO" && pnpm install --frozen-lockfile >&2)
echo "packing create-mercury (build + template snapshot)" >&2
pnpm --dir "$REPO/cli" pack --pack-destination "$RUN" > "$RUN/logs/pack.log" 2>&1 \
  || die "pack failed, see $RUN/logs/pack.log"
TARBALL=$(ls "$RUN"/create-mercury-*.tgz)

cat > "$RUN/state.env" <<STATE
RUN_ID=$RUN_ID
RUN=$RUN
REPO=$REPO
TARBALL=$TARBALL
TMUX_SOCKET=verify-create-mercury-$RUN_ID
GIT_HEAD=$(git -C "$REPO" rev-parse --short HEAD)
GIT_DIRTY=$(git -C "$REPO" status --porcelain --untracked-files=no | wc -l)
STATE

echo "ready: $TARBALL ($(stat -c %s "$TARBALL") bytes)" >&2
echo "export VERIFY_CLI_RUN=$RUN"
