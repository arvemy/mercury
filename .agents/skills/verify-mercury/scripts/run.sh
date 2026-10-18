#!/usr/bin/env bash
set -euo pipefail
repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$repo"
if [ "${1:-}" = --public ]; then
  pnpm build
  pnpm test:worker
elif [ "${1:-}" = --deployed ]; then
  pnpm test:deployed
elif [ $# = 0 ]; then
  pnpm test:integration
else
  echo 'usage: run.sh [--public|--deployed]' >&2
  exit 2
fi
