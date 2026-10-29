#!/bin/sh
# Esegue tutti gli scenari nell'app vera e fallisce se anche un solo controllo non è superato.
# Uso: sh scripts/run-all-smoke.sh [cartella-uscita]     (su Linux senza schermo: xvfb-run -a sh scripts/run-all-smoke.sh)
#
# Stabilità:
#  - l'interfaccia si compila una sola volta (non 17);
#  - uno scenario che fallisce viene rieseguito UNA volta. Se alla seconda passa è segnalato come INSTABILE (non come superato in silenzio):
#    la prima esecuzione resta in <scenario>.tentativo1.log per capire che cosa è successo. Con STRICT=1 anche un INSTABILE fa fallire.
#  - se il computer è molto carico lo scrive all'inizio: sotto carico un fallimento isolato è più probabile (vedi anche run-smoke-carico.sh).
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/mngmnt-smoke-all}"
FALLITI=0; INSTABILI=""
SCENARI="${SCENARI:-smoke-hooks smoke-ditta smoke-novita smoke-tiles smoke-collegamenti smoke-digitazione smoke-giudiziale smoke-documenti smoke-miglioramenti smoke-qualita smoke-release smoke-hig smoke-proforma smoke-backup-accessibility smoke-modello-layout smoke-security smoke-aggiornamenti smoke-profilo-ditta smoke-orologio smoke-gestione smoke-strumenti}"
CORE=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
CARICO=$(uptime 2>/dev/null | sed 's/.*load averages\{0,1\}: *//' | awk '{gsub(",","."); print $1}')
awk -v c="$CARICO" -v n="$CORE" 'BEGIN { if (c > n * 0.75) printf "ATTENZIONE: computer carico (carico %.1f su %d core): chiudi altre app per risultati più affidabili\n", c, n }'
mkdir -p "$OUT"
npx vite build >/dev/null 2>&1 || { echo "Compilazione dell'interfaccia non riuscita"; exit 1; }

esegui() { # $1 scenario  $2 log  -> 0 se superato
  SKIP_BUILD=1 sh scripts/run-smoke.sh "$OUT/$1" "$1" > "$2" 2>&1
  CODICE=$?
  RIS=$(grep -E "^RISULTATO" "$2" | tail -1)
  [ "$CODICE" -eq 0 ] && [ -n "$RIS" ] && ! grep -q "^FAIL" "$2"
}

for SC in $SCENARI; do
  LOG="$OUT/$SC.log"
  if esegui "$SC" "$LOG"; then
    echo "OK  $SC  $(grep -E '^RISULTATO' "$LOG" | tail -1)"
  else
    cp "$LOG" "$OUT/$SC.tentativo1.log"
    PRIMO=$(grep -E "^FAIL|^ERRORE" "$LOG" | head -2 | tr '\n' ' ')
    if esegui "$SC" "$LOG"; then
      INSTABILI="$INSTABILI $SC"
      echo "INSTABILE  $SC  (passato al secondo tentativo; primo: ${PRIMO:-nessun risultato})  $(grep -E '^RISULTATO' "$LOG" | tail -1)"
    else
      FALLITI=$((FALLITI+1))
      RIS=$(grep -E "^RISULTATO" "$LOG" | tail -1)
      echo "KO  $SC  ${RIS:-nessun risultato}"; grep -E "^FAIL|^ERRORE|^ +\[axe|^ +es: " "$LOG" | head -12
    fi
  fi
done

[ -n "$INSTABILI" ] && echo "Scenari instabili (da indagare, log del primo tentativo in $OUT):$INSTABILI"
if [ "$FALLITI" -ne 0 ]; then echo "$FALLITI scenari con problemi"; exit 1; fi
if [ -n "$INSTABILI" ] && [ -n "$STRICT" ]; then echo "STRICT: scenari instabili considerati falliti"; exit 1; fi
echo "Tutti gli scenari superati"
