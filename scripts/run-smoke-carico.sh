#!/bin/sh
# Prova di stabilità: esegue gli scenari indicati mentre il computer è sotto carico (cicli di calcolo su quasi tutti i core).
# Un test affidabile deve passare anche così. Uso: sh scripts/run-smoke-carico.sh <cartella-uscita> scenario1 scenario2 ...   (CARICO=n per cambiare il numero di cicli)
cd "$(dirname "$0")/.."
OUT="$1"; shift
N="${CARICO:-$(( $(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu) - 1 ))}"
PIDS=""
for i in $(seq 1 "$N"); do ( while :; do :; done ) & PIDS="$PIDS $!"; done
trap 'kill $PIDS 2>/dev/null' EXIT INT TERM
echo "carico artificiale: $N cicli"
npx vite build >/dev/null 2>&1
KO=0
for SC in "$@"; do
  mkdir -p "$OUT"
  SKIP_BUILD=1 sh scripts/run-smoke.sh "$OUT/$SC" "$SC" > "$OUT/$SC.log" 2>&1
  RIS=$(grep -E "^RISULTATO" "$OUT/$SC.log" | tail -1)
  if [ -z "$RIS" ] || grep -q "^FAIL" "$OUT/$SC.log"; then KO=$((KO+1)); echo "KO  $SC  ${RIS:-nessun risultato}"; grep -E "^FAIL|^ERRORE" "$OUT/$SC.log" | head -3; else echo "OK  $SC  $RIS"; fi
done
echo "FINE falliti=$KO"
[ "$KO" -eq 0 ]
