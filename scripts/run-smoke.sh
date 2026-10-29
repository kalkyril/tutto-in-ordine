#!/bin/sh
# Uso: sh scripts/run-smoke.sh [cartella-screenshot] [scenario]   (scenario: smoke-hooks | smoke-ditta)
set -e
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/mngmnt-smoke}"
SCEN="${2:-smoke-hooks}"
DATA="$(mktemp -d)"
trap 'rm -rf "$DATA"' EXIT
[ -n "$SKIP_BUILD" ] || npx vite build >/dev/null 2>&1
MNGMNT_TEST=1 MNGMNT_TEST_SCENARIO="$SCEN" MNGMNT_DATA_DIR="$DATA" SMOKE_OUT="$OUT" MNGMNT_TEST_PDF_DIR="$OUT" npx electron .
