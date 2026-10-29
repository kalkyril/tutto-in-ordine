# TIO — guida per chi sviluppa

Come avviare TIO dai sorgenti, creare gli installer, pubblicare una versione e verificare le modifiche. Per installare e usare l'app vedi il [README](README.md); le novità di ogni versione sono nello [storico](CHANGELOG.md).

## Avvio

```bash
npm ci            # Node 24 o 25
npm run dev       # Vite + Electron con ricarica automatica
npm start         # build + avvio dell'app compilata
```

Lo script `postinstall` del progetto scarica il runtime Electron della versione fissata, verificandolo con i checksum del pacchetto. Non saltarlo nelle installazioni pulite destinate a sviluppo o test.

La cartella dati è `~/Library/Application Support/TIO` (macOS), `%APPDATA%\TIO` (Windows); con la variabile `MNGMNT_DATA_DIR` se ne usa un'altra (le prove usano sempre una cartella temporanea). Il nome interno `mngmnt` (file `mngmnt.db`, variabili `MNGMNT_*`, `window.mngmnt`) resta per compatibilità con gli archivi esistenti.

## Creare gli installer sul proprio computer

```bash
npm run dist:mac     # .dmg per Apple Silicon e Intel
npm run dist:win     # installer .exe (Windows 64 bit)
```

- **Mac:** firma *ad-hoc* (`mac.identity: "-"`, senza account Apple) e senza notarizzazione: all'apertura macOS chiede conferma (vedi il README). Il runtime rafforzato è spento perché serve solo alla notarizzazione e, con una firma ad-hoc, impedirebbe di caricare le librerie dell'app.
- **Windows:** installer NSIS per il singolo utente, non firmato (SmartScreen avvisa al primo avvio). Una build incrociata dal Mac funziona: il modulo grafico `@napi-rs/canvas-win32-x64-msvc` della stessa versione di `@napi-rs/canvas` va messo temporaneamente in `node_modules` (`scripts/prepare-native.js` lo verifica) e il pacchetto di macOS va escluso dai file.
- Gli installer escludono le parti di PDF.js e Tesseract che l'app non carica (`build.files` in `package.json`, elenco `excluded` in `licenses/native/manifest.json`); `npm run test:pacchetto` controlla che i file caricati davvero restino inclusi.
- Gli hook di build (`scripts/prepare-native.js`, `scripts/check-packaged-licenses.js`) raccolgono e verificano licenze e componenti nativi; possono riscrivere `licenses/index.html` e `licenses/inventory.json` con i dati della piattaforma di destinazione.
- Una build incrociata non sostituisce la prova sul sistema di destinazione: per l'app impacchettata c'è lo scenario `smoke-packaged` (vedi sotto).

## Pubblicare una versione su GitHub

**Prima uscita pubblica: 1.0.0 (versione 1.0), per decisione del titolare.** Le numerazioni 1.3/1.4 nello storico sono build interne precedenti al lancio. Il numero 1.0.0 è applicato; la prova manuale su un PC Windows reale è stata rimandata per decisione del titolare e restano le prove automatiche del workflow.

Il workflow `.github/workflows/build.yml` si avvia con un tag che inizia con `v`:

1. Per il primo lancio aggiorna la versione (`npm version 1.0.0 --no-git-tag-version`) e lo [storico](CHANGELOG.md), poi salva in Git.
2. Soltanto al momento della pubblicazione crea e invia il tag: `git tag v1.0.0 && git push origin v1.0.0`.
3. Su Windows e macOS il workflow esegue `npm test`, l'audit delle dipendenze e tutti gli scenari nell'app vera in modalità stretta. Crea gli installer e avvia gli eseguibili impacchettati con `smoke-packaged`; soltanto se passano pubblica la *Release* con i codici di controllo (`SHA256SUMS.txt`).

Regole:

- **Beta come pre-release.** Un tag con il trattino (`v1.4.0-beta.6`, `v1.5.0-rc.1`) diventa una *pre-release*: GitHub non la mostra come ultima versione; il controllo degli aggiornamenti dell'app la propone solo a chi usa già una beta (chi ha una versione stabile riceve solo le stabili).
- **Numeri pubblici sempre crescenti:** dopo il primo lancio `1.0.0`, usare `1.0.1`, `1.1.0` e così via. Il ritorno dalle build interne 1.4 alla prima pubblica 1.0 è una scelta di lancio: il confronto semver resta invariato e le vecchie beta non vedranno 1.0 come aggiornamento più recente. Chi le ha installate dovrà installare manualmente la versione pubblica, verificando prima un backup. Conservare `productName` «TIO», `appId` `it.tio.app` e cartella dati per mantenere la stessa identità dell'app.
- **Prima del primo invio a GitHub:** controllare che l'autore dei commit sia l'indirizzo *noreply* di GitHub di chi pubblica (`git log --format='%an <%ae>' | sort -u`), e aggiungere a `package.json` il campo `"repository": "github:kalkyril/tutto-in-ordine"`, che attiva il controllo degli aggiornamenti negli installer creati sul proprio computer. Quelli creati dal workflow lo ricevono da soli: prima della build il workflow scrive in `package.json` il nome del repository in cui gira. `npm run verifica:pubblicazione` controlla che tra i file da pubblicare non ci siano segreti o file esclusi.
- **Da decidere prima di pubblicare:** chi pubblica e un canale reale per le segnalazioni di sicurezza (su GitHub: *Security › Private vulnerability reporting*, vedi [SECURITY.md](SECURITY.md)); una verifica di calcoli e diciture fiscali da parte di un professionista; una ricerca sul nome «TIO» rispetto a marchi già registrati nel settore. TIO resta gratuito e senza servizi a pagamento: se cambiasse, vanno rivalutati il Cyber Resilience Act (Regolamento UE 2024/2847) e la direttiva sulla responsabilità da prodotti (UE 2024/2853), che oggi escludono il software libero fornito fuori da un'attività commerciale.

## Pagina di download

La cartella `sito/` è la pagina di download, statica: HTML, CSS, il carattere Literata incluso (licenza OFL) per i titoli, immagini registrate dall'app con dati di esempio inventati. Nessun cookie e nessuna richiesta a terzi, salvo quella a GitHub per conoscere la stabile o, se manca, la prima beta pubblica disponibile.

- **Anteprima:** `python3 -m http.server 4173 --directory sito`, poi `http://localhost:4173`.
- **Pubblicazione:** il workflow `.github/workflows/sito.yml` esegue i test del sito e lo prepara per GitHub Pages (una volta sola: Settings › Pages › Source «GitHub Actions»). `scripts/prepare-site.js` inserisce repository, link HTML di riserva e URL assoluti per canonical e immagine Open Graph: download e documentazione funzionano anche senza JavaScript o con API non raggiungibile. In locale, senza configurazione, l'anteprima resta senza richieste esterne. Per un altro hosting: `npm run prepare:sito -- utente/progetto https://indirizzo-del-sito/`.

## Test

```bash
npm test                  # tutte le prove automatiche: dati, avvisi, calendari, backup, compensi, termini, PDF, sicurezza, pacchetto…
npm run test:sito         # browser isolato, risposte GitHub simulate, desktop/telefono, tastiera e contrasto
npm run test:packaged     # dopo la build: eseguibili in release/mac*, oppure release/win-unpacked
npm run test:canali       # ogni canale usato dall'interfaccia ha il suo gestore ed è consentito dal preload
npm run test:licenses     # integrità di avvisi, sorgenti e binari nativi
sh scripts/run-all-smoke.sh [cartella]   # tutti gli scenari nell'app vera, in sequenza
```

`run-all-smoke.sh` compila una volta, riesegue una volta uno scenario fallito e lo segnala INSTABILE se al secondo tentativo passa (con `STRICT=1` l'instabilità vale come errore); se il computer è molto carico lo scrive all'inizio. `sh scripts/run-smoke-carico.sh <cartella> <scenari…>` esegue gli scenari con il computer sotto carico. Un singolo scenario: `sh scripts/run-smoke.sh <cartella> <scenario>`.

| Scenario | Cosa prova nell'app vera |
| --- | --- |
| `smoke-hooks` | flusso completo dello studio legale, con screenshot e PDF |
| `smoke-orologio` | ritardi al passare del tempo, mezzanotte, ritorno alla finestra e ripresa del computer; percorsi rimossi dal registro |
| `smoke-ditta` | ditta individuale, modifiche, eliminazioni, trascinamenti, sicurezza |
| `smoke-novita` | conflitto di interessi, esito udienza, timer, stampa agenda, report, ricerca nei documenti, blocco con password |
| `smoke-tiles` | collegamenti in riquadri, nessun sito preimpostato |
| `smoke-collegamenti` | calendari collegati in sola lettura (link, file `.ics`, link sbagliati), importazioni, pratiche ricavate dagli eventi |
| `smoke-digitazione` | digitazione reale in tutti i campi: il cursore non deve saltare |
| `smoke-giudiziale` | tutte le competenze civili e penali, indeterminabili, aumenti e riduzioni, parcella intera a 1220×772, PDF |
| `smoke-documenti` | file collegati, spostamenti, Sincronizza, Ricollega |
| `smoke-miglioramenti` | tastiera, Annulla, cronologia, ordinamento e selezione delle pratiche |
| `smoke-qualita` | 3.000 pratiche e 12.000 scadenze, testo ostile, accessibilità (axe-core) |
| `smoke-release` | modifiche non salvate, focus, paginazione, finestra minima |
| `smoke-hig` | aspetto e accessibilità secondo le linee guida Apple, contrasto aumentato |
| `smoke-proforma` | importazione della nota pro forma da PDF e Word |
| `smoke-backup-accessibility` | backup, ripristino e accessibilità delle Impostazioni |
| `smoke-modello-layout` | editor del modello PDF |
| `smoke-security` | confini di sicurezza dell'interfaccia |
| `smoke-aggiornamenti` | controllo facoltativo degli aggiornamenti (GitHub simulato) |
| `smoke-profilo-ditta` | nel profilo ditta Agenda, Panoramica, stampa e scheda della pratica non parlano di udienze |
| `smoke-axe` | rapporto dettagliato di accessibilità (diagnostico, senza riga RISULTATO) |

Gli scenari non usano pause fisse: `scripts/lib/attesa.js` allunga le attese in base al carico e aspetta che la pagina smetta di cambiare. Lo scenario `smoke-ditta` (riordino trascinando) è sensibile al carico del computer.

**App impacchettata:** `npx electron-builder --mac dir`, poi si avvia il binario con `MNGMNT_TEST=1`, `MNGMNT_TEST_SCENARIO=smoke-packaged`, `MNGMNT_DATA_DIR=<cartella temporanea>` (e facoltativamente `SMOKE_OUT=<cartella>`): verifica nel pacchetto PDF, OCR, ricerca, importazioni, backup cifrati, ripristino e anteprime (21 controlli). `npm test` comprende anche le prove di robustezza: archivi precedenti, corrotti o troncati, crash durante la scrittura, più processi insieme, 49.000 righe, input ostili, nomi riservati di Windows, date limite.

## Architettura

- `electron/` — processo principale (CommonJS), un file per responsabilità: `db.js` (SQLite con `node:sqlite`, migrazioni all'apertura), `alerts.js` (avvisi), `backup.js` e `backup-key.js`, `blocco.js` (password), `calendari.js` + `ical.js` (calendari in sola lettura, link o file `.ics`), `pratiche-da-eventi.js` (pratiche riconosciute negli eventi), `importer.js` + `tabelle.js`, `docx.js` + `zip.js` (lettura dei file Word), `doctext.js` (testo dei documenti e OCR), `tariffe.js` (parametri forensi, indeterminabili), `aggiornamenti.js` (controllo facoltativo su GitHub), `registro.js` (registro locale di errori, tempi di avvio e blocchi), `cartelle-utente.js` (cartelle predefinite e scritture negate), `cartella-dati.js` (passaggio dei dati da MNGMNT/LARA Studio), `preload.js` (API isolata con canali in allow-list).
- `electron/ipc/` — canali divisi per area: `dati`, `documenti`, `calendari`, `importazione`, `sistema`, `esportazione`; `index.js` applica a tutti il controllo dell'origine e il blocco con password, annota gli errori nel registro e spiega le scritture negate.
- `src/` — interfaccia React + TypeScript (Vite): `pages/` (una per voce di menu), `components/` (parti riusabili; `components/pratica/` = schede di una pratica), `lib/` (logica pura verificabile: calcoli, termini, report, conflitti). Stili: `styles.css` → `hig.css` → `stile-dati.css` (vince l'ultimo).
- Sicurezza: `contextIsolation`, `sandbox`, nessun `nodeIntegration`, CSP, file aperti solo tramite id o dopo una scelta con la finestra di sistema, link esterni solo `http(s)`/`mailto`/`tel`.

## Dati normativi

Il calcolo tabellare funziona offline dalle tabelle in `electron/data/tariffe-dm55.json`, generate dagli allegati ufficiali con `scripts/genera-tabelle-normative.py`; fonti e scelte in [electron/data/FONTI-PARAMETRI.md](electron/data/FONTI-PARAMETRI.md). Ogni aggiornamento va verificato sui decreti e documentato. Il confronto con i calcolatori di avvocatoandreani.it serve come controllo, non come fonte.
