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

Ogni push su `main` e ogni pull request avviano le verifiche su Windows e macOS. In GitHub Actions, gli artefatti `registri-windows-latest` e `registri-macos-latest` contengono `suite.log` e i registri dei singoli scenari Electron. Per provare anche gli installer si può avviare il workflow a mano. Per pubblicare una versione si usa un tag che inizia con `v`.

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
npm run lint              # oxlint: errori di correttezza e regole di React sugli hook (anche dentro npm test)
npm run test:archivi      # archivio vero della 1.0.0 aperto con Node e con il Node di Electron (node:sqlite è sperimentale)
npm run test:campione     # richiamo e precisione di Anonimizza sul campione annotato in scripts/fixtures/campione-anonimizza
npm run test:prestazioni  # budget di prestazioni: archivio grande, Budget, report, documento lungo in Word e PDF (anche dentro npm test)
npm run copertura         # righe di src/lib ed electron eseguite da npm test (solo informativa, riesegue tutte le prove)
node scripts/misura-anonimizza.mjs <cartella> [--dettagli]   # la stessa misura su documenti propri annotati (fuori dal progetto)
node scripts/misura-import.js <file.csv>                     # importazione di un file vero in un archivio temporaneo: stampa solo numeri
sh scripts/run-all-smoke.sh [cartella]   # tutti gli scenari nell'app vera, in sequenza
```

Il lint usa [oxlint](https://oxc.rs) e non ESLint perché `typescript-eslint` non supporta ancora TypeScript 7: le regole sono quelle di ESLint (stessi nomi e stessi commenti `eslint-disable`). Ogni eccezione a `react-hooks/exhaustive-deps` porta il motivo nel commento.

Ogni scenario ha un tempo massimo (`MNGMNT_TEST_MAX_MIN`, predefinito 15 minuti): allo scadere l'app si chiude da sola e, se è bloccata del tutto, la chiude `run-smoke.sh` due minuti dopo. Per i controlli che dipendono da un aggiornamento della pagina si usa `attendi()` di `scripts/lib/attesa.js` (aspetta la condizione) invece di una pausa fissa.

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
| `smoke-aggiornamenti` | controllo degli aggiornamenti, acceso per tutti e disattivabile (GitHub simulato) |
| `smoke-profilo-ditta` | nel profilo ditta Agenda, Panoramica, stampa e scheda della pratica non parlano di udienze |
| `smoke-103` | ruoli e contatti per pratica, limite di 25, selezione multipla, cliente principale e cronologia, ricerca in rubrica, documenti e accessibilità |
| `smoke-105` | editor dei documenti (interlinea, spazio prima e dopo, sottolineature colorate, colore del testo), linea dell’intestazione, luogo e data, «Tariffa totale» e parcella dalle voci, rate con l’ultima scadenza |
| `smoke-axe` | rapporto dettagliato di accessibilità (diagnostico, senza riga RISULTATO) |

Gli scenari non usano pause fisse: `scripts/lib/attesa.js` allunga le attese in base al carico e aspetta che la pagina smetta di cambiare. Lo scenario `smoke-ditta` (riordino trascinando) è sensibile al carico del computer.

### Prestazioni

`scripts/test-prestazioni.mjs` (circa 10 secondi, dentro `npm test`) dà un tempo massimo alle operazioni che rallentano per prime quando l'archivio cresce; un limite superato fa fallire la prova, in locale e nella CI su Mac e Windows:

- **archivio grande** (3.000 pratiche, 12.000 scadenze, 12.000 attività, 9.000 ore, 6.000 note): apertura con controllo di integrità come in `electron/main.js`, lettura delle tabelle della prima schermata (le stesse di `src/store.tsx`, lette dal sorgente: se l'elenco cambia la prova lo segue), copia verso la finestra (serializzazione come l'IPC), rubrica e allegati caricati dopo;
- **Budget e report** su 4.000 documenti, 8.000 voci da pagare e 12.000 ore: la catena di `src/components/budget/contesto.ts` (movimenti, uscite ricorrenti, saldi, stima di tasse e contributi, budget, previsione, indicatori), prima nota, solleciti, redditività, dati di fatturazione;
- **documento lungo** (1.800 blocchi, 169 pagine): tutti i formati di `electron/documento.js` e il PDF con la stampa isolata dell'app (`electron/print-pdf.js`, in un processo Electron separato: `scripts/prestazioni-pdf.js`);
- **crescita:** con il doppio dei dati il tempo deve al massimo triplicare (lineare ≈ ×2, quadratico ≈ ×4). Questo controllo non dipende dalla velocità del computer: scopre un algoritmo quadratico anche dove i limiti assoluti, larghi per i runner, non lo noterebbero. Prima di ogni misura si libera la memoria e, se il rapporto supera il limite, si rimisura fino a 3 volte: un runner disturbato può sforare una volta, un algoritmo quadratico sfora sempre.

Ogni tempo è il migliore di alcuni giri. I limiti (in `LIMITI`, con accanto il tempo misurato su un Mac con Apple M) sono 5-8 volte i tempi locali, per i runner Windows più lenti. Se un computer è più lento: `TIO_PRESTAZIONI_FATTORE=2 npm run test:prestazioni` raddoppia i limiti. Un rallentamento già noto da correggere nel codice dell'app va in `ECCEZIONI`, con motivo e scadenza come in `scripts/controlla-audit.js`: fino alla scadenza la prova lo stampa con «NOTA» senza bloccare, dopo blocca di nuovo; quando la correzione arriva la prova scrive «eccezione non necessaria su questo computer»: la voce si toglie quando lo scrive sia su Mac sia su Windows (con dati piccoli la parte quadratica di `solleciti()` può restare sotto il limite su un runner veloce). In CI i tempi sono salvati in `prestazioni.json` negli artefatti `registri-…`, per confrontarli tra un push e l'altro. Eccezioni aperte (scadenza 31/01/2027): `redditivita()` e `solleciti()` in `src/lib/report.ts` filtrano tutte le righe per ogni pratica o documento (tempo quadratico; redditività di 4.000 pratiche circa 0,75 s).

Per aggiungere una misura: una voce in `LIMITI` (tempo locale × 5, arrotondato) e una chiamata `misura(nome, () => …)`; per una funzione che scorre elenchi anche `crescita(nome, (n) => …, n)` con tempi di almeno 5 ms.

### Copertura

`npm run copertura [cartella]` riesegue tutte le prove di `npm test` con la misura di V8 (`NODE_V8_COVERAGE`, nessuna dipendenza in più) e scrive `riepilogo.txt` (percentuale per file e righe scoperte), `copertura.json` e `lcov.info` (per le estensioni «Coverage Gutters» degli editor); senza cartella usa `<temporanei>/tio-copertura`. Le prove che compilano `src/lib` con Vite ricevono le mappe dei sorgenti da `scripts/lib/copertura-hook.mjs`, così le righe tornano ai file `.ts` senza modificare le prove; le righe di soli tipi non contano. Non sono misurati i processi Electron (sito, scenari nell'app vera). Per ora è solo informativa: nella CI gira su Windows, non blocca, il riepilogo compare nella pagina dell'esecuzione e il rapporto completo nell'artefatto `copertura`. Quando i numeri saranno stabili si potrà fissare una soglia minima per cartella, da alzare man mano.

### Proposta: branch, pull request e controlli obbligatori prima del merge

Oggi si lavora direttamente su `main`: le prove su Windows e macOS girano dopo il push, quando il commit è già nella storia pubblica. Così sono arrivati su `main` e poi corretti con un secondo commit i percorsi costruiti con `URL.pathname` (sbagliati su Windows), l'audit delle dipendenze fallito e il contrasto insufficiente del sito. Il workflow `build.yml` gira già sulle pull request: manca solo l'obbligo di passarci.

Flusso proposto:

1. **Ogni modifica su un branch** (`git switch -c correzione/percorsi-windows`); le sessioni di Claude Code lavorano già in branch `claude/…`.
2. **Prima del push, in locale:** `npm test`; per modifiche all'interfaccia anche `sh scripts/run-all-smoke.sh`.
3. **Push del branch e pull request** verso `main` (`git push -u origin <branch>`, poi «Compare & pull request» su GitHub o `gh pr create --fill`). Partono «Prove (windows-latest)» e «Prove (macos-latest)»: audit, `npm test` con prestazioni e sito, scenari nell'app vera.
4. **Merge solo con i controlli verdi** («Squash and merge», poi il branch si cancella). Il workflow riparte su `main` e verifica il risultato dell'unione.
5. **Tag di versione solo da `main`** dopo il merge, come oggi (`git tag v1.0.5 && git push origin v1.0.5`): le regole dei branch non toccano i tag.

Per attivarlo (lo fa il titolare del repository; nessuno script lo attiva da sé):

1. Apri almeno una pull request, così GitHub conosce i nomi dei controlli.
2. Su GitHub: *Settings › Rules › Rulesets › New ruleset › New branch ruleset*. Nome «main protetto», *Enforcement status* «Active», *Target branches* «Include default branch».
3. Spunta *Restrict deletions*, *Block force pushes*, *Require a pull request before merging* (approvazioni richieste: 0, perché chi lavora da solo non può approvare le proprie pull request) e *Require status checks to pass*, con *Require branches to be up to date before merging*; aggiungi i controlli «Prove (windows-latest)» e «Prove (macos-latest)».
4. *Bypass list* vuota: anche l'amministratore passa dalle pull request. Se serve una via d'uscita per le emergenze, aggiungi «Repository admin» solo per le pull request (*For pull requests only*), non per il push diretto.
5. Salva con *Create* e prova: `git push origin main` da una copia locale deve essere rifiutato con «Changes must be made through a pull request».

Lo stesso da terminale, con la [GitHub CLI](https://cli.github.com) autenticata come titolare:

```bash
gh api -X POST repos/kalkyril/tutto-in-ordine/rulesets --input - <<'JSON'
{ "name": "main protetto", "target": "branch", "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" }, { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": { "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false,
      "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": false } },
    { "type": "required_status_checks", "parameters": { "strict_required_status_checks_policy": true,
      "required_status_checks": [ { "context": "Prove (windows-latest)" }, { "context": "Prove (macos-latest)" } ] } } ] }
JSON
```

Conseguenze da sapere: ogni modifica, anche di una riga, aspetta le prove su due sistemi (circa 20-40 minuti con gli scenari nell'app vera); le sessioni che oggi committano su `main` dovranno pubblicare un branch e aprire una pull request; se il repository diventa privato, i minuti macOS valgono 10 volte quelli Linux. Facoltativo in seguito: `concurrency` con `cancel-in-progress` per le pull request in `build.yml`, così un nuovo push sullo stesso branch ferma le prove del push precedente.

**App impacchettata:** `npx electron-builder --mac dir`, poi si avvia il binario con `MNGMNT_TEST=1`, `MNGMNT_TEST_SCENARIO=smoke-packaged`, `MNGMNT_DATA_DIR=<cartella temporanea>` (e facoltativamente `SMOKE_OUT=<cartella>`): verifica nel pacchetto PDF, OCR, ricerca, importazioni, backup cifrati, ripristino e anteprime (21 controlli). `npm test` comprende anche le prove di robustezza: archivi precedenti, corrotti o troncati, crash durante la scrittura, più processi insieme, 49.000 righe, input ostili, nomi riservati di Windows, date limite.

## Architettura

- `electron/` — processo principale (CommonJS), un file per responsabilità: `db.js` (SQLite con `node:sqlite`, migrazioni all'apertura), `alerts.js` (avvisi), `backup.js` e `backup-key.js`, `blocco.js` (password), `calendari.js` + `ical.js` (calendari in sola lettura, link o file `.ics`), `pratiche-da-eventi.js` (pratiche riconosciute negli eventi), `importer.js` + `tabelle.js`, `docx.js` + `zip.js` (lettura dei file Word), `doctext.js` (testo dei documenti e OCR), `tariffe.js` (parametri forensi, indeterminabili), `aggiornamenti.js` (controllo facoltativo su GitHub), `registro.js` (registro locale di errori, tempi di avvio e blocchi), `cartelle-utente.js` (cartelle predefinite e scritture negate), `cartella-dati.js` (passaggio dei dati da MNGMNT/LARA Studio), `preload.js` (API isolata con canali in allow-list).
- `electron/ipc/` — canali divisi per area: `dati`, `documenti`, `calendari`, `importazione`, `sistema`, `esportazione`; `index.js` applica a tutti il controllo dell'origine e il blocco con password, annota gli errori nel registro e spiega le scritture negate.
- `src/` — interfaccia React + TypeScript (Vite): `pages/` (una per voce di menu), `components/` (parti riusabili; `components/pratica/` = schede di una pratica), `lib/` (logica pura verificabile: calcoli, termini, report, conflitti). Stili: `styles.css` → `hig.css` → `stile-dati.css` (vince l'ultimo).
- Sicurezza: `contextIsolation`, `sandbox`, nessun `nodeIntegration`, CSP, file aperti solo tramite id o dopo una scelta con la finestra di sistema, link esterni solo `http(s)`/`mailto`/`tel`.

## Dati normativi

Il calcolo tabellare funziona offline dalle tabelle in `electron/data/tariffe-dm55.json`, generate dagli allegati ufficiali con `scripts/genera-tabelle-normative.py`; fonti e scelte in [electron/data/FONTI-PARAMETRI.md](electron/data/FONTI-PARAMETRI.md). Ogni aggiornamento va verificato sui decreti e documentato. Il confronto con i calcolatori di avvocatoandreani.it serve come controllo, non come fonte.
