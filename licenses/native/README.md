# Avvisi e sorgenti dei componenti nativi

Raccolta introdotta con TIO 1.3.2, verificata il 26 ottobre 2026 per TIO 1.4.0-beta.7 con Electron 44.9.3. Gli avvisi del runtime sono copiati dalla distribuzione installata; MIT e avvisi Chromium risultano identici a quelli della 44.7.2. I testi originali mantengono le licenze dei rispettivi titolari. Il manifest contiene 146 componenti/revisioni, 321 file con SHA-256 e 211 impronte di binari/dati per cinque destinazioni. Alcuni componenti dei lockfile servono solo alla compilazione o ad altre piattaforme; l’elenco non prova che tutti siano collegati al runtime.

## Sorgenti disponibili

- `sources/mpl/`: archivi originali cssparser 0.38.0, cssparser-color 0.6.0, cssparser-macros 0.7.0 e dtoa-short 0.3.5, forniti sotto MPL-2.0, con codice Rust, Cargo.toml e licenza. Sono tar.gz con estensione `.crate`; Cargo gestisce dipendenze e compilazione secondo i manifest inclusi.
- `sources/liberation-fonts-1.07.4.tar.gz`: sorgenti originali SFD, README, Makefile, COPYING e License.txt, GPL v2 con le eccezioni originali. Per costruire i font serve FontForge; seguire le istruzioni incluse. Il file è l’archivio originale recuperato dal pacchetto sorgente Cygwin ufficiale, con hash e membro registrati nel manifest.

Questi materiali sono distribuiti insieme all’app e non richiedono un collegamento al futuro repository. I componenti MPL e i font non sono modificati da TIO. Non applicare la MIT del progetto ai loro sorgenti. Rispettare le condizioni originali anche in successive redistribuzioni.

## Provenienza

`manifest.json` registra URL, commit, hash degli archivi, membri estratti e file di avviso per componente. `evidence/` conserva manifest, lockfile, istruzioni di build e SBOM ufficiali dei fornitori. I binari macOS Canvas corrispondono ai file e agli SHA-256 dichiarati negli SBOM della release v1.0.11; i wrapper OCR e i modelli corrispondono ai blob Git delle revisioni registrate. I testi PDF.js provengono dalla versione esatta, inclusi gli avvisi annidati.

Il runtime Rust è identificato dal commit incorporato nei due binari macOS. Sono raccolti copyright e dipendenze del relativo `library/Cargo.lock`, escluse soltanto le destinazioni SGX, VEX e WASI non distribuite. I testi completi dei fornitori possono menzionare directory di test o componenti non collegati: conservarli non significa dichiararne l’uso. Non è una build riproducibile verificata né una verifica delle firme di attestazione.

## Aggiornamento e ripristino

Dalla radice del progetto:

```sh
npm run licenses:check
npm run test:licenses
python3 scripts/fetch-native-notices.py --restore
npm run licenses
```

Il recupero scarica soltanto file già revisionati, verifica gli hash e non approva nuove dipendenze. Per un aggiornamento confrontare le nuove build, i relativi sottomoduli e toolchain, verificare le condizioni dei singoli componenti, aggiungere avvisi/sorgenti richiesti e solo successivamente aggiornare il manifest e gli hash. Conservare i sorgenti per ciascuna versione effettivamente distribuita.

I due file `pdfjs-dist/wasm/quickjs-eval.*` sono esclusi dagli installer perché inutilizzati e privi degli avvisi necessari nel pacchetto upstream corrente. Il controllo dopo l’impacchettamento impedisce di reincluderli accidentalmente.

La revisione di Electron 44.9.3 include `evidence/electron/checksums.json`, proveniente dal pacchetto npm con integrità registrata nel manifest. Gli avvisi MIT e Chromium della distribuzione installata sono identici byte per byte a quelli revisionati per 44.7.2. I componenti PDF, OCR, grafici e Rust non sono cambiati.
