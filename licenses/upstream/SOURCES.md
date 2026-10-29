# Fonti degli avvisi upstream

Raccolta del 14 ottobre 2026. I testi dei pacchetti installati in `../packages/` restano la fonte primaria per le rispettive versioni. I riferimenti ai rami riportati sotto descrivono il recupero storico. Per Canvas/Skia, Leptonica e dati OCR la raccolta normativa corrente è in `../native/manifest.json`: usa revisioni esatte, hash, avvisi dei componenti incorporati e sorgenti richiesti. I tre testi generici storici sono conservati come copie aggiuntive, non come prova della composizione dei binari.

- `tessdata-Apache-2.0.txt`: https://raw.githubusercontent.com/naptha/tessdata/gh-pages/LICENSE — licenza del repository che distribuisce i modelli OCR.
- `Skia-BSD-3-Clause.txt`: https://raw.githubusercontent.com/google/skia/main/LICENSE — avviso Skia.
- `Leptonica-BSD.txt`: https://raw.githubusercontent.com/DanBloomberg/leptonica/master/leptonica-license.txt — componente del motore OCR.
- `is-url-MIT.txt`: https://raw.githubusercontent.com/segmentio/is-url/master/LICENSE-MIT — dipendenza JavaScript.
- `tr46-MIT.txt`: https://raw.githubusercontent.com/jsdom/tr46/main/LICENSE.md — avviso con copyright di Sebastian Mayr, mantenuto dal progetto upstream.
- `Electron-MIT.txt` e `Chromium-Notices.html`: copiati da `node_modules/electron/dist/` della versione effettivamente installata, non da una pagina generica della licenza.

La verifica corrente delle build native è documentata in `../../AUDIT-LICENZE-NATIVE-1.3.2.md`. Ogni aggiornamento richiede una nuova analisi delle build effettive.
