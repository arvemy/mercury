#!/usr/bin/env bash
# Call the API through the web dev server's /api proxy (the path the browser uses)
# and save request, status, and body as evidence.
# Usage: api.sh <label> METHOD PATH [json-body]
#   -> prints and writes $VERIFY_RUN/evidence/<label>/api-<n>.txt
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_run
[ $# -ge 3 ] || die "usage: api.sh <label> METHOD PATH [json-body]"
out=$RUN/evidence/$1
mkdir -p "$out"
n=$(( $(find "$out" -name 'api-*.txt' | wc -l) + 1 ))
file=$out/api-$n.txt
args=(-sS -X "$2" -w '\nHTTP %{http_code}\n')
[ $# -ge 4 ] && args+=(-H 'content-type: application/json' --data "$4")
{ echo "> $2 $WEB_URL$3${4:+ $4}"; curl "${args[@]}" "$WEB_URL$3"; } | tee "$file"
echo "saved $file" >&2
