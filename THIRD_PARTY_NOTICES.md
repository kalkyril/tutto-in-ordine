# Componenti di terzi

Il codice e le icone originali di TIO sono MIT, come indicato in LICENSE. Dipendenze, font, modelli e dati esterni mantengono le proprie licenze. La MIT del progetto non modifica i diritti dei destinatari su tali parti. I componenti originali non sono stati modificati per questa revisione delle licenze.

## Consultazione e sorgenti

In **Impostazioni → Backup e sicurezza → Informazioni**, scegliere **Licenze e componenti** oppure **Cartella licenze e sorgenti**. Negli installer la cartella `licenses` è disponibile come risorsa fisica, fuori dall’archivio ASAR, con i testi integrali e i sorgenti indicati sotto. Su macOS si trova in `TIO.app/Contents/Resources/licenses`; sugli altri sistemi nella cartella `resources/licenses` dell’applicazione.

`licenses/inventory.json` elenca le dipendenze npm raccolte, comprese React e Lucide compilate nell’interfaccia. `licenses/sbom-produzione.json` è l’inventario CycloneDX npm di produzione. `licenses/native/manifest.json` registra componenti nativi, revisioni, provenienza, impronte SHA-256, avvisi e archivi dei sorgenti. Include anche dipendenze di compilazione o di destinazioni alternative: non afferma che tutte siano collegate a ogni eseguibile.

| Componente | Condizioni e materiali forniti |
| --- | --- |
| React, React DOM, scheduler | MIT; testi originali dei pacchetti |
| Electron 44.7.2 | MIT e avvisi completi Chromium/Node copiati dal runtime installato |
| Lucide / icone Feather incluse | ISC e MIT; testo completo del pacchetto |
| PDF.js 6.4.299 | Apache-2.0; avvisi separati OpenJPEG, qcms, JBIG2/PDFium, Adobe CMaps, profilo ICC e font Foxit/PDFium |
| Liberation Sans 1.07.4 inclusi in PDF.js | GPL v2 con le eccezioni originali di Liberation: testi completi e sorgenti SFD, README e Makefile in `licenses/native/sources/liberation-fonts-1.07.4.tar.gz`. I font sono forniti senza modifiche e non installati nel sistema. Questa versione non usa la licenza OFL delle versioni successive. |
| Tesseract.js / tesseract.js-core 7.0.0 | Apache-2.0; avvisi dei nove sottomoduli nativi e della toolchain Emscripten 4.0.15, inclusi musl e LLVM |
| OpenLibm nel motore OCR | Testo completo con condizioni MIT/BSD/ISC e parti di pubblico dominio; i riferimenti LGPL riguardano i file di test specificati nell’avviso, non collegati al runtime distribuito |
| Modello italiano 1.0.0 | Dati Apache-2.0 da `naptha/tessdata`, verificati contro i blob della revisione registrata. Il campo MIT nei metadata npm non sostituisce la licenza dei modelli. |
| @napi-rs/canvas 1.0.11, Skia e dipendenze | MIT del wrapper; BSD di Skia; testi dei componenti selezionati dalla build, copyright e avvisi sui brevetti conservati. FreeType utilizzato secondo FTL; ICU secondo Unicode V3. Vedere manifest per le altre condizioni. |
| cssparser 0.38.0, cssparser-color 0.6.0, cssparser-macros 0.7.0, dtoa-short 0.3.5 | MPL-2.0. Sorgenti originali completi e licenze disponibili negli archivi `.crate` di `licenses/native/sources/mpl/`, accessibili anche dalla pagina delle licenze. Gli archivi si aprono come tar.gz. I sorgenti di queste parti restano MPL-2.0. |
| Runtime Rust e altre dipendenze incorporate | Copyright e licenze originali conservati, incluse MIT/Apache-2.0, BSD, ISC e Unicode; la raccolta include un insieme prudenziale derivato dai lockfile |
| Altre dipendenze npm | Inventario e testi corrispondenti, inclusi gli avvisi recuperati per is-url e tr46 |
| rizzo-pii (Simone Rizzo — Rizzo AI Academy) | MIT; testo completo qui sotto. Codice derivato nella sezione Anonimizza (`src/lib/anonimizza.ts`): non è incluso il modello linguistico. |

## Attribuzioni

Portions of this software are based in part on the work of the FreeType Team.

This software is based in part on the work of the Independent JPEG Group.

Gli avvisi originali, i nomi degli autori e le condizioni restano nei rispettivi file. La raccolta non concede diritti sui marchi né costituisce una verifica generale di brevetti.

## Codice derivato da rizzo-pii

La rete di espressioni regolari e codici di controllo della sezione Anonimizza (codice fiscale anche omocodico, IBAN con il formato di stampa a gruppi e le lunghezze ISO 13616, partita IVA, carte di pagamento con l’algoritmo di Luhn e la scadenza attaccata, telefoni, importi, targhe, indirizzi web e IP, numeri degli atti) e la strategia di fusione dei candidati derivano da [rizzo-pii](https://github.com/Rizzo-AI-Academy/rizzo-pii), rilasciato con questa licenza:

```
MIT License

Copyright (c) 2026 Simone Rizzo — Rizzo AI Academy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Il ringraziamento nell’app, nella guida e sul sito è un omaggio all’autore; TIO non è un prodotto di Rizzo AI Academy e non ne usa il modello, i dati di addestramento o i marchi.

## Perimetro della revisione

Il 14 ottobre 2026 sono stati raccolti 146 componenti/revisioni e 320 file verificati di avvisi, sorgenti ed evidenze. I binari macOS di Canvas corrispondono alle impronte degli SBOM ufficiali della release upstream; la ricostruzione usa i commit dei sottomoduli, i lockfile e la revisione del compilatore incorporata nei binari. Non è stata riprodotta la compilazione dei fornitori né verificata la firma delle loro attestazioni. Le destinazioni Windows/Linux registrate richiedono la verifica del pacchetto finale e prove sul sistema corrispondente.

Il sandbox QuickJS di PDF.js, inutilizzato dall’app, è escluso dagli installer: il pacchetto upstream 6.4.299 omette gli avvisi relativi. L’esclusione è controllata sul pacchetto finale. Lettura, rendering, importazione e OCR PDF continuano a usare i rispettivi componenti. Riferimento: [segnalazione upstream PDF.js](https://github.com/mozilla/pdf.js/issues/22143).

`npm run licenses` raccoglie ricorsivamente i testi installati e genera la pagina locale. `npm run licenses:check` verifica versioni, impronte e sorgenti nativi. La compilazione ripete il controllo prima e dopo l’impacchettamento: aggiornamenti e nuovi binari richiedono una nuova revisione, non una semplice modifica degli hash. Dettagli in [AUDIT-LICENZE-NATIVE-1.3.2.md](AUDIT-LICENZE-NATIVE-1.3.2.md).

## Materiali originali e contenuti esterni

L’icona «Firma» (`build/icon.svg`) è disegnata direttamente in SVG ed è MIT; non incorpora icone di terzi. Marchi e nomi di altri prodotti appartengono ai rispettivi titolari; non è dichiarata un’affiliazione con Apple, servizi di calendario o calcolatori esterni.

Le tabelle normative sono ricostruite dagli allegati ufficiali: provenienza e limiti in `electron/data/FONTI-PARAMETRI.md`. Codice, pagine, risposte, testi e layout del sito privato delle versioni precedenti non sono concessi dalla licenza del progetto. L’importatore legge dati riconoscibili dai file scelti dall’utente e genera un modello autonomo.
