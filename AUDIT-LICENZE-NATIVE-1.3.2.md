# Revisione delle licenze native — MNGMNT 1.3.2

14 ottobre 2026. La MIT del progetto è conservata. Le parti di terzi mantengono le proprie licenze e i diritti dei destinatari; i sorgenti richiesti sono forniti insieme all’app. Nessun repository è stato creato o pubblicato.

## Risultato dell’analisi

La sola licenza MIT del pacchetto Canvas o Apache del motore OCR non descrive tutte le parti incorporate. La revisione ricostruisce i componenti dalle versioni effettive: Canvas 1.0.11, Skia e dodici dipendenze esterne del suo SBOM; Tesseract core 7.0.0 e nove sottomoduli; Emscripten 4.0.15; PDF.js 6.4.299; modelli OCR italiano e inglese 1.0.0; runtime Electron 44.7.0 e runtime Rust identificato nei binari macOS.

Sono raccolti **146 componenti/revisioni e 321 file verificati**. I 213 record di artefatti comprendono destinazioni alternative e dati distribuiti; 210 file sono presenti nell’ambiente macOS di verifica, che contiene entrambe le architetture Canvas. Gli archivi Cargo sono verificati contro i checksum dei lockfile. Per le parti omesse dai pacchetti sono recuperati i testi alle revisioni sorgente esatte. Sono conservati anche gli avvisi sui brevetti presenti negli archivi.

I due binari macOS Canvas hanno SHA-256 corrispondenti agli SBOM pubblicati nella [release upstream v1.0.11](https://github.com/Brooooooklyn/canvas/releases/tag/v1.0.11). L’analisi conserva un insieme prudenziale di dipendenze di build/piattaforma: 146 non è il numero di librerie effettivamente collegate in ogni eseguibile. Non è stata riprodotta la compilazione upstream né verificata la firma delle attestazioni.

## Correzioni rilevanti

- **MPL-2.0:** cssparser, cssparser-color, cssparser-macros e dtoa-short richiedono avvisi e disponibilità dei sorgenti. I quattro archivi originali sono forniti localmente, con codice e licenza. Non occorre cambiare la MIT dei file originali di MNGMNT: la MPL consente opere più ampie con file sotto altre licenze. [FAQ ufficiale Mozilla, Q8 e Q11](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).
- **Font Liberation 1.07.4:** PDF.js usa questa versione storica, GPL v2 con le eccezioni originali, anziché l’OFL dei font successivi. Inclusi testo completo e archivio originale dei sorgenti FontForge, istruzioni e Makefile. Non sono state sostituite le font, la cui struttura è utilizzata da PDF.js.
- **PDF.js:** raccolti ricorsivamente gli avvisi OpenJPEG, qcms, JBIG2/PDFium, font Foxit/PDFium, CMaps Adobe e ICC. Il sandbox QuickJS, non usato, è escluso dal pacchetto finale per l’omissione dei suoi avvisi upstream. [Problema upstream](https://github.com/mozilla/pdf.js/issues/22143).
- **OCR:** distinta la licenza Apache dei dati dalla MIT indicata nei metadata dei pacchetti; verificati i quattro modelli contro i blob della revisione registrata. Conservati gli avvisi Emscripten, musl, LLVM e dei sottomoduli. La LGPL citata nell’avviso OpenLibm riguarda specifici file di test non collegati.
- **Attribuzioni:** conservate FTL di FreeType, Unicode V3 di ICU e le condizioni IJG, con riconoscimenti FreeType e Independent JPEG Group nella documentazione e nella pagina locale.

## Controlli introdotti

`npm run licenses:check` controlla integrità dei testi e sorgenti, versioni, binari e nuovi file nativi nelle dipendenze di produzione. Dieci prove negative verificano anche cancellazione/manomissione degli avvisi, sorgenti mancanti, dipendenze cambiate, nuovi binari, SBOM incongruenti e percorsi non validi. Il controllo della build confronta inoltre il binario della destinazione con lo SBOM del fornitore.

Le licenze vengono copiate fuori da ASAR, come risorse leggibili senza strumenti di sviluppo. Due comandi nelle impostazioni aprono la pagina e la cartella locale. Il controllo dopo l’impacchettamento verifica di nuovo il contenuto effettivo e l’assenza di QuickJS. Un recuperatore ripristina solo i materiali già revisionati dagli URL registrati, controllandone le impronte.

## Limiti prima della pubblicazione

Questa è una revisione tecnica documentale delle versioni registrate; non è una certificazione legale, una ricerca sui marchi o una verifica generale di brevetti. Gli aggiornamenti richiedono una nuova analisi. Le prove native finali svolte sono macOS Apple Silicon e x64 tramite Rosetta; Windows/Linux e Mac Intel fisico richiedono ancora prove proprie. I punti ancora da decidere prima della pubblicazione sono in [SVILUPPO.md](SVILUPPO.md).
