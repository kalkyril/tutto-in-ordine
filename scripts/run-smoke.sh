#!/bin/sh
# Uso: sh scripts/run-smoke.sh [cartella-screenshot] [scenario]   (scenario: smoke-hooks | smoke-ditta)
# Tempo massimo per scenario: MNGMNT_TEST_MAX_MIN minuti (predefinito 15). L'app stessa si chiude allo scadere;
# se è bloccata del tutto (finestra di sistema, processo fermo) la chiude questo script poco dopo, così un giro
# completo non resta mai fermo per ore.
set -e
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/mngmnt-smoke}"
SCEN="${2:-smoke-hooks}"
DATA="$(mktemp -d)"
trap 'rm -rf "$DATA"' EXIT
[ -n "$SKIP_BUILD" ] || npx vite build >/dev/null 2>&1
MAX_MIN="${MNGMNT_TEST_MAX_MIN:-15}"
LIMITE="${SMOKE_LIMITE_S:-$(( (MAX_MIN + 2) * 60 ))}"
# il programma Electron direttamente (non tramite npx), così il processo da sorvegliare è proprio l'app
ELECTRON="$(node -e "process.stdout.write(require('electron'))")"
set +e
MNGMNT_TEST=1 MNGMNT_TEST_SCENARIO="$SCEN" MNGMNT_DATA_DIR="$DATA" SMOKE_OUT="$OUT" MNGMNT_TEST_PDF_DIR="$OUT" MNGMNT_TEST_MAX_MIN="$MAX_MIN" "$ELECTRON" . &
PID=$!
( t=0
  while kill -0 "$PID" 2>/dev/null; do
    sleep 5; t=$((t + 5))
    if [ "$t" -ge "$LIMITE" ]; then
      echo "ERRORE: scenario $SCEN ancora aperto dopo $LIMITE secondi: chiuso dall'esterno"
      kill -TERM "$PID" 2>/dev/null; sleep 5; kill -KILL "$PID" 2>/dev/null
      break
    fi
  done ) &
GUARDIA=$!
wait "$PID"; CODICE=$?
wait "$GUARDIA" 2>/dev/null
exit "$CODICE"
