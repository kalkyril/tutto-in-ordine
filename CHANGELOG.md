# Storico delle versioni

Novità di ogni versione di TIO, dalla più recente. Come installare e usare TIO è spiegato nel [README](README.md).

## Versione 1.0.3 — Panoramica dell'anno, più persone nella pratica, sottocartelle

Piccole correzioni e aggiunte raccolte usando TIO su più computer. Si installa sopra la 1.0.2: l'archivio non cambia formato.

- **Agenda, vista Mese:** l'orario di un impegno non va più a capo («11:00» diventava «11:0 / 0» nelle colonne strette). L'orario resta sempre intero; nei giorni stretti (finestra piccola, fine settimana) passa sopra il titolo, che ha tutta la larghezza su due righe. Le colonne da lunedì a venerdì sono più larghe di sabato e domenica.
- **Pagamenti › Scadenzario:** **panoramica dell'anno** in dodici colonne (Gen, Feb, Mar…): per ogni mese entrate e uscite totali con le barre, e sotto la differenza, verde se positiva, rossa se negativa, gialla se pari. Un clic sul mese porta ai suoi movimenti. A finestra stretta le colonne diventano 6, 4 o 3 per riga.
- **Pratiche e commesse:**
  - **più persone** nella stessa pratica: altri clienti, controparti, fornitori e collaboratori, ognuno con il suo ruolo («Altre persone» in Modifica); compaiono in testa alla pratica, nei dettagli e nella ricerca;
  - **Il tuo ruolo**: il ruolo che ricopri nella pratica (Difensore, Domiciliatario, Progettista, CTU… o libero).
- **Documenti della pratica:** le **sottocartelle** della cartella collegata si vedono e si sfogliano (percorso in alto per risalire, «Tutti i file insieme» per l'elenco unico di prima); le cartelle senza file compaiono come **Vuota**.
- **Anagrafica:** in Modifica si aggiungono **altri indirizzi** con etichetta (Sede operativa, Domicilio, Cantiere…) e si **collega il contatto a una pratica o commessa**; la scheda del contatto elenca tutte le pratiche in cui compare, con il ruolo. Dai dettagli della pratica un clic sul nome apre il contatto.
- L'avviso di conflitto di interessi resta su cliente e controparte principali.
- Guida e sito aggiornati, con la nuova immagine dello scadenzario; nel sito «Si collega» diventa **Collegamenti** (un elenco al posto degli otto riquadri) e «Tutto in un'app» ha quattro riquadri più larghi.
- Eliminando un contatto, sparisce anche dalle altre persone delle pratiche. L'archivio resta compatibile con la 1.0.2 (schema 6).

## Versione 1.0.2 — Pagamenti, documenti più completi, Comprimi PDF

Nuove funzioni chieste da chi usa TIO ogni giorno e revisione dell'interfaccia con le linee guida di Apple per le app desktop, WCAG 2.2 e una prova con dati estremi (nomi lunghissimi, parole senza spazi, caratteri non latini).

- **Pagamenti:** «Documenti e incassi» (o «Parcelle») e «Da pagare» diventano un'unica voce della barra laterale, **Pagamenti** (⌘6), con tre schede:
  - **Scadenzario**: mese per mese incassi ricevuti e attesi, voci pagate e da pagare, con i totali, il saldo previsto, i filtri (entrate, uscite, ancora aperti), le scadenze arretrate in cima ed esportazione CSV;
  - **Incassi** (per lo studio legale «Parcelle») e **Da pagare**, come prima.
- **Contabile del pagamento:** quando una voce da pagare diventa «Pagata» TIO propone di allegare la ricevuta (PDF o immagine); la copia sta nella cartella dati ed entra nei backup. «Contabile…» la aggiunge o la sostituisce dopo.
- **Valore della pratica o commessa:** nella scheda «Parcelle» del lavoro (per professionisti e ditte «Fatture e pagamenti») fatture incassate e da incassare, voci pagate e da pagare, **grafico a torta** e margine previsto. I colori si scelgono in Impostazioni › Generale › Aspetto e valgono anche per lo scadenzario.
- **Anagrafica:**
  - corretto: in un contatto nuovo, scegliere Ruolo o Tipo salvava e chiudeva la finestra; ora si salva solo con «Salva» (i pulsanti a scelta non inviano più il modulo, in tutta l'app);
  - **titolo** facoltativo delle persone fisiche (Avv., Ing., Dott.… o libero), mostrato davanti al nome;
  - **più telefoni e più email**, ognuno con un'etichetta (Cellulare, Fisso, Ufficio… o personalizzata); il primo resta quello principale, compatibile con importazioni e versioni precedenti;
  - **codice SDI**, proposto da solo nella fattura elettronica;
  - per professionisti e ditte il ruolo è **Cliente, Fornitore, Collaboratore o Altro**.
- **Attività:** la tariffa oraria ha il menu **Inserisci** / **Da decidere**; con «Da decidere» le ore diventano nel documento una voce a 0 € «tariffa oraria da decidere», da completare.
- **Documenti:**
  - l'editor del testo diventa quasi un programma di videoscrittura: titolo, sottotitolo, titoletto, paragrafo e citazione; dimensione del testo fino a 72 pt; barrato, colore, evidenziatore; **tabelle** (righe e colonne da aggiungere o togliere, riga d'intestazione ripetuta su ogni pagina); **immagini** (anche incollate o trascinate, ridotte e compresse); **interruzioni di pagina**; annulla e ripeti;
  - **capitoli e titoli riconosciuti** nel testo incollato (da Word e pagine web con la loro struttura; da PDF, email e testo semplice: «CAPITOLO 1», «Art. 3», «1.2 Oggetto», righe in maiuscolo, elenchi, tabelle con tabulazioni o Markdown), pulsante «Riconosci titoli e capitoli» e **indice** cliccabile;
  - **{{corpo.documento}}**: un testo lungo (atti, relazioni, contratti con capitoli, tabelle e immagini) da incollare quando crei il documento, dentro la tua carta intestata;
  - **campi personalizzati** dal menu «Inserisci campo… › + Nuovo campo personalizzato…» («entro {{n.giorni}} giorni», «compenso di € {{compenso}}»), chiesti alla creazione del documento;
  - **foto della firma** (Impaginazione › Firma) al posto di {{firma}};
  - **luogo e data** in alto o in basso, a destra o a sinistra;
  - **Anteprima** a tutta finestra, pagina per pagina, con lo zoom fino al 300%, anche in «Crea documento» con i campi compilati;
  - dimensione **Grandissima** e **sottolineato** nelle righe di intestazione e piè di pagina (anche nel Modello PDF), titoli dei documenti fino a 54 pt, testo del corpo fino a 28 pt;
  - Word, OpenDocument, RTF, HTML, Markdown e testo esportano tabelle, immagini, citazioni, interruzioni di pagina, colori, dimensioni e barrato; nei file Word ogni elenco numerato riparte da 1.
- **Comprimi PDF** (nuovo strumento): PDF più leggeri per PEC, email e depositi, con tre livelli (minima, media, massima), più file alla volta, trascinandoli o scegliendoli. Tutto sul computer; il testo resta selezionabile; l'originale non si tocca e il file nuovo si chiama «… (compresso).pdf». Nelle prove: un manuale da 6,3 MB scende a 0,55 MB, uno da 209 MB e 4.234 pagine a 171 MB.
- **Impostazioni:** per libero professionista e ditta individuale niente più scheda «Modello PDF» (intestazione e piè di pagina dei documenti si curano in Documenti); nel piè di pagina predefinito della ditta «Sede:» al posto di «Studio legale:».
- **Peso:** la sola dipendenza nuova è pdf-lib (MIT): circa 3,9 MB installata e 0,4 MB nell'installer compresso, escluse le versioni per browser; la compressione lavora in un processo separato con un limite di memoria e si chiude a lavoro finito.
- **Dati:** schema 6 con cinque colonne nuove (titolo, SDI e recapiti in anagrafica, tariffa da decidere nelle attività, contabile nelle voci da pagare), aggiunte da sole all'apertura; i backup delle versioni precedenti si ripristinano come prima.
- **Sito e guida:** il sito racconta TIO come app unica per tutto il lavoro, con le sezioni nuove «Tutto in un’app» e «Si collega» (calendari, Cliens, fattura elettronica, Word, Excel, cartelle, posta, intelligenza artificiale), le schede su scadenzario, valore della commessa, editor dei documenti e Comprimi PDF e domande nuove. Tutte le immagini di sito, guida e README sono state rifatte dalla 1.0.2 con dati inventati (`scripts/immagini-sito.js`). La guida ha due sezioni nuove, «Un’app sola per tutto» e «Con cosa si collega TIO», e le immagini delle funzioni della 1.0.2.
- **Testo incollato:** «1. Premessa» da solo (anche prima di un elenco puntato) diventa un titolo; «1. …» seguito da «2. …» resta un elenco numerato. Nei modelli Word l’elenco dei campi non propone più firma e testo lungo, che lì non funzionano.
- **Ricerca:** l’etichetta dei risultati segue il profilo («Commessa», «Incarico») invece di dire sempre «Pratica».

- **Finestre strette e testo ingrandito:** la Panoramica non scorre più di lato nella finestra minima (980 × 640) e allo zoom 125%; i numeri in cima restano allineati anche quando un'etichetta va su più righe; le colonne che scorrono sfumano in fondo invece di tagliare l'ultima voce a metà.
- **Testi lunghi:** ragioni sociali, luoghi ed email senza spazi vanno a capo invece di uscire da schede, righe e dettagli; i titoli negli elenchi si fermano a tre righe e non coprono più lo stato.
- **Controlli:** campi, menu e pulsanti affiancati hanno la stessa altezza (Cliente +, stati della pratica, avvisi, tipologie); i pulsanti fatti solo di un'icona e le «×» per togliere etichette e colori misurano almeno 24 × 24; nella tavolozza le «×» compaiono sul colore indicato o raggiunto con Tab.
- **Righe di scadenze e compiti:** righe semplici, senza riquadro dentro il riquadro e senza bordo laterale colorato; l'urgenza la dicono l'etichetta («ieri», «oggi») e la data. Nella vista per stato il colore della pratica è un pallino accanto al numero.
- **Documenti:** la disposizione di tutto il documento (allineamento, due colonne) passa nella scheda Impaginazione; nella scheda Contenuto resta solo la barra dell'editor per i singoli paragrafi. Nome e tipo del modello sono allineati.
- **Pulsanti:** in Agenda e nella pratica «Calcola termine» ha lo stesso stile delle altre azioni secondarie; nella finestra del documento contabile «Titolo e font» sta a sinistra, le azioni sul documento a destra, poi Chiudi e Salva.
- **Testi:** la scheda di una pratica con scadenze già passate dice «Nessuna scadenza in arrivo» (prima «Nessuna scadenza» accanto a «1 in ritardo»); in Anagrafica il tipo compare solo se indicato, e scrivendo una ragione sociale («… S.r.l.», «Studio …») il tipo passa da solo a Società / Ente.
- **Accessibilità:** testo d'esempio nei campi con contrasto almeno 4,5:1; titoli in ordine anche nelle pagine vuote; niente etichetta sopra il titolo di Documenti e Anonimizza; con «riduci movimento» finestre e messaggi si dissolvono senza spostarsi.
- **Rifiniture:** titoli bilanciati senza una parola sola sull'ultima riga, selezione del testo nel colore dell'app, il menu «+ Spesa extra…» non esce più dal suo riquadro.
- **Leggera anche dopo anni e aggiornamenti:**
  - la cronologia delle pratiche non si carica più tutta nella finestra a ogni modifica: si legge solo quella della pratica aperta (prima, con migliaia di righe, ogni salvataggio le rileggeva tutte);
  - all'apertura l'archivio si mantiene da sé: notifiche già lette più vecchie di 90 giorni tolte (al massimo 500), promemoria giornalieri vecchi dimenticati, file temporaneo dell'archivio limitato a 32 MB, compattazione quando più di un quarto del file è spazio vuoto (per esempio dopo la conversione di logo e font della 1.0.1);
  - dopo ogni aggiornamento si svuotano le cache del motore della finestra, che con ogni versione cambiano nome e non si riusano più, e si tolgono le cartelle temporanee rimaste da una chiusura improvvisa;
  - delle copie di sicurezza fatte prima di un ripristino restano le tre più recenti (ognuna è un archivio intero).
- **Colore principale predefinito:** blu inchiostro (#24527a) al posto dell'indaco, per chi installa da zero; chi ha già scelto un colore lo mantiene.

## Versione 1.0.1 — correzioni e nuove voci

Correzioni emerse soprattutto su Windows (verificate anche su Mac) e alcune voci nuove.

- **Impostazioni › Aspetto:** il tema scuro (e il chiaro) si applica appena lo scegli, senza premere «Salva»; anche la barra del titolo di Windows, i menu e le finestre di sistema seguono il tema scelto.
- **Documenti:**
  - nuovi modelli «Delega» (per tutti i profili) e «Delega di udienza» (studio legale); chi ha già i modelli li aggiunge con «Aggiungi i predefiniti»;
  - **intelligenza artificiale (L. 132/2025, art. 13):** nuovo modello «Informativa uso dell’intelligenza artificiale» per studi legali e professionisti, e clausola sull’IA nell’«Incarico professionale» (un «Incarico professionale» già presente non cambia da solo: per avere la clausola, eliminalo e premi «Aggiungi i predefiniti», oppure scrivila nel tuo modello); `PRIVACY.md` spiega pseudonimizzazione, AI Act e cartella di Cliens;
  - **«+ Nuovo modello» › Modello personalizzato:** un modello da zero con il nome che scegli, pagina bianca o con l'intestazione dei documenti di vendita;
  - **Impaginazione:** margini in alto, in basso e ai lati e dimensione del testo, anche nei file Word, OpenDocument e RTF;
  - **font:** Palace Script MT tra i caratteri pronti, font importati da file (incorporati nel PDF) e **font installati sul computer**, scelti da un elenco con ricerca;
  - la scelta del modello è un menu a tendina sopra nome e tipo: editor e anteprima usano tutta la larghezza; il pulsante «Usa intestazione, piè di pagina e font dei documenti di vendita» va a capo nelle finestre strette.
- **Anonimizza:**
  - segnaposto in italiano: `[NOME_COMPLETO_1]`, `[DATA_1]`, `[CODICE_FISCALE_1]`… (le chiavi salvate con la 1.0.0 si ripristinano ancora); il ripristino accetta anche «NOME COMPLETO_1» scritto dall'IA con lo spazio;
  - un nome non prende più la riga successiva («MIROLO ALESSANDRO» a capo «Nome …»): i dati evidenziati restano su una riga ed etichette come «Nome», «Cognome», «Residenza» restano in chiaro;
  - il pulsante «OCR» diventa «Rileggi come scansione», con l'avanzamento e l'esito: riconosce il testo dalle immagini delle pagine dei PDF scansionati.
- **Pratiche e Cliens:**
  - importazione dell'esportazione dei fascicoli di **Cliens Cube** (`EXPORT_FASCICOLI.csv`): titolo, cliente e controparte dall'«Intestazione» («PARTE ASSISTITA / CONTROPARTE +N», anche senza spazi o con un lato vuoto), RG dal «Ruolo», autorità dalla «Descrizione ufficio», materia in chiaro (CIV → Civile, VG → Volontaria giurisdizione, GdP → Giudice di pace…), oggetto nelle note; i fascicoli con la stessa intestazione restano pratiche distinte e la stessa società scritta «S.R.L.» o «SRL» è un'anagrafica sola;
  - importazione dell'elenco delle pratiche di Cliens: riconosce «Cliente/i», «Controparte/i», «Parte assistita», «Codice pratica»…, ricava cliente e controparte dall'oggetto «ROSSI MARIO c/ BIANCHI SRL», salva nelle note le colonne senza un campo e completa i campi vuoti delle pratiche già importate;
  - **documenti di Cliens:** la cartella in cui scarichi i documenti da Cliens (una sottocartella per pratica, abbinata da sola) si unisce alla cartella locale della pratica in un'unica vista, con le sezioni «In comune con Cliens», «Solo su Cliens» e «Solo sul computer». Un file presente in entrambe è un documento solo; «Sincronizza cartelle» (nella pratica) e «Sincronizza tutte le pratiche» (Impostazioni › Integrazioni) collegano i file nuovi e uniscono i doppioni. TIO legge soltanto: nessun file viene copiato, spostato o cancellato.
- **Parcelle (studio legale):**
  - nel menu **Competenza** il gruppo «Fatture avvocati e conti», come su avvocatoandreani.it: fattura avvocati e studi legali, scorporo importi (dal totale, dal netto o dall'imponibile), calcolo della ritenuta d'acconto e compenso a ore, con regime ordinario o forfettario e bollo;
  - pulsante **Anteprima** in basso a destra nei nuovi documenti (parcella, nota pro forma, preventivo, fattura, nota di credito), con le modifiche non ancora salvate;
  - **titolo dei documenti** modificabile come nei modelli di Documenti: testo, font, dimensione, grassetto/corsivo e allineamento per nota pro forma, fattura, preventivo e nota di credito.
- **Importazione da Cliens:** prima di importare si sceglie **chi è il cliente** quando le parti vengono dall'intestazione («A c/ B»): la prima parte, la seconda, oppure riga per riga con un elenco consultabile e la ricerca.
- **Aggiornamenti:** il controllo delle nuove versioni è acceso per tutti (anche per chi nella 1.0.0 aveva scelto «Non ora»: un avviso nel campanello lo spiega) e si spegne dalle Impostazioni; quando esce una versione nuova compare il riquadro «Aggiornamento». L'aggiornamento resta manuale.
- **Più veloce con archivi grandi:**
  - logo, immagini e font dei modelli si salvano **una volta sola** e i modelli li richiamano: prima ogni modello di Documenti ne conteneva una copia, riscritta a ogni modifica (con un logo da 1 MB e dieci modelli, decine di MB nelle impostazioni). Gli archivi della 1.0.0 si convertono da soli all'apertura;
  - salvare le impostazioni non ricarica più tutte le pratiche (solo quando si rinomina uno stato);
  - «Sincronizza», «Sincronizza cartelle», il collegamento di una cartella intera e Cliens lavorano **senza bloccare la finestra**, con l'avanzamento in alto; un secondo clic aspetta il lavoro in corso invece di rifarlo;
  - la sincronizzazione con Cliens **ricorda le impronte** dei file: rilegge solo quelli nuovi o modificati.
- **Anonimizza più preciso:** indirizzi con «dei», «del», «in» («via dei Mille 14», «via Radici in Piano 18») e fino al numero civico («via Emilia Est 220»); città dopo l'indirizzo e nel luogo e data delle lettere («Modena, 4 novembre 2026»); luogo di un fatto («è mancato … a Sassuolo»); parenti per nome («mio fratello Davide»); nome e cognome quando il cognome era già noto; il solo nome in calce; ragioni sociali in maiuscolo («S.R.L.», «SOC. COOP.»); «n. 2231/2024 R.G.»; i nomi di luogo dopo «Tribunale di», «Comune di» non diventano più persone.
- **Corretto:** l'avviso di possibile conflitto di interessi nel modulo della pratica poteva bloccare la pagina quando compariva mentre si compilava (errore di React sull'ordine degli hook).
- **Dati:** schema 5 con tre colonne nuove (cartella di Cliens della pratica, copia su Cliens e sezione del documento) e due tabelle (risorse dei modelli, impronte dei file sincronizzati), aggiunte da sole all'apertura; i backup della 1.0.0 si ripristinano come prima.
- **Per chi sviluppa:** controllo del codice con oxlint (regole di React sugli hook comprese) dentro `npm test`; misura di Anonimizza su un campione annotato (`npm run test:campione`, o una cartella propria) e dell'importazione su un file vero (`node scripts/misura-import.js`, stampa solo numeri); un archivio creato davvero dalla 1.0.0 si apre a ogni prova sia con Node sia con il Node di Electron; ogni scenario nell'app vera ha un tempo massimo anche dall'esterno, e i controlli instabili aspettano lo stato della pagina invece di una pausa fissa.

## Versione 1.0.0 — prima versione pubblica

Prima uscita di TIO per tutti, gratuita e open source (licenza MIT). Comprende tutto il lavoro delle build interne elencate sotto, fino alla 1.4.0-beta.9, più le correzioni del controllo finale:

- **Pagamenti dettagliati:** lo stato del documento segue sempre il registro dei pagamenti, anche quando cambia il netto; annullare e ripristinare un documento resta possibile.
- **Documenti collegati:** TIO non avvia programmi o script dai documenti collegati; resta disponibile «Mostra nella cartella».
- **Registro degli errori:** date, numeri di ruolo ed espressioni come «e/o» non vengono più scambiati per percorsi da rimuovere.
- **Panoramica:** gli importi lunghi restano dentro il loro riquadro e la disposizione compatta si attiva anche su schermi bassi.
- **Windows:** l'installer si chiama `TIO-Setup-1.0.0.exe`, lo stesso nome che compare su GitHub.
- **Strumenti › Documenti:** modelli per lettere, preventivi, diffide, procure, incarichi, verbali e relazioni con intestazione, logo e piè di pagina; campi compilati da destinatario, lavoro e attività (e campi liberi); testo a sinistra, al centro, a destra o giustificato, tutto o in parte su due colonne; documento in Word, PDF, OpenDocument, RTF, HTML, Markdown o testo, salvato e collegato al lavoro.
- **Strumenti › Anonimizza:** anonimizzazione reversibile di PDF (anche scansioni), Word, OpenDocument, RTF, email e testo, sul computer. Riconosce 22 categorie di dati personali, i clienti e le pratiche dell'archivio e la stessa persona anche col solo cognome; correzioni con un clic, copia per l'IA, copia Word con la stessa impaginazione, chiave e ripristino della risposta. Ispirato a Rizzo PII di Simone Rizzo (licenza MIT).
- **Anonimizza sui PDF con l'impaginazione originale:** copia in cui ogni pagina è l'immagine dell'originale con i dati coperti e il segnaposto scritto sopra; niente testo, metadati, moduli o allegati dell'originale. Funziona anche sulle scansioni lette con l'OCR. Posizioni dei caratteri misurate sui font standard dei documenti (inclusi Helvetica e Times non incorporati).
- **Fattura elettronica XML (FatturaPA FPR12, schema 1.2.3):** dall'editor della fattura, con CPA o rivalsa INPS, ritenuta, bollo virtuale, spese escluse art. 15, regime forfettario e pagamento; controlli prima del salvataggio, codice destinatario e PEC ricordati per cliente. TIO non invia nulla allo SdI.
- **Modelli Word:** un proprio `.docx` (carta intestata) diventa un modello; i campi tra doppie graffe si compilano anche se Word li spezza, e la copia conserva stili, immagini, intestazione e piè di pagina. Il file è conservato nell'archivio ed entra nei backup.
- **Nota di credito:** storno totale di una fattura emessa con numerazione «NC», fattura «stornata», PDF e XML TD04 con il riferimento alla fattura; prima nota e totali la compensano.
- **Scadenze fiscali ricorrenti** pronte per profilo e regime (IVA, LIPE, imposte, dichiarazioni, ritenute, bollo, Cassa Forense, INPS, diritto camerale), anche per gli studi legali; sabati e festivi slittano al primo giorno lavorativo.
- **Guida di TIO:** il manuale completo in 22 capitoli, incluso nell'installer e consultabile senza internet da Aiuto › Guida di TIO (F1), dai comandi rapidi e dalle Impostazioni, con ricerca, tema chiaro e scuro e versione da stampare.
- **Da pagare:** nuova sezione sotto Parcelle per prestazioni, consulenze, spese extra e fornitori da pagare, con scadenze e stato del pagamento.
- **Spese extra** nei preventivi e nei documenti: voci pronte (marca da bollo, contributo unificato, carburante, trasferte, pedaggi, materiali…) già impostate con o senza IVA.
- **Aggiornamento disponibile:** un riquadro accanto alla ricerca avvisa della nuova versione e porta alla pagina di download.
- **Informativa privacy (art. 13 GDPR)** tra i modelli predefiniti e incarico professionale con la clausola sul trattamento dei dati.
- **Anonimizza in blocco:** tutti i documenti di una pratica in una volta, con gli stessi segnaposto in ogni file e una sola chiave di ripristino.
- **Ditte e professionisti:** niente udienze e calcolo dei termini processuali, nessun avviso di conflitto di interessi, testi con le parole del profilo («Nuovo incarico», «Nuova commessa», fornitori, documenti di vendita).
- **Documenti:** modelli predefiniti del profilo pronti alla prima apertura, nome del modello modificabile a piacere, «Da modello…» nella scheda Documenti della pratica.
- **Dati:** schema 5, invariato rispetto alla beta 9. Chi arriva da una build di prova fa un backup e installa sopra: il controllo degli aggiornamenti delle beta non propone da solo la 1.0.0, perché per il confronto delle versioni 1.0.0 è precedente a 1.4.0.

Le versioni da 1.1.0 a 1.4.0-beta.9 qui sotto sono build interne precedenti al lancio e non sono state pubblicate.

## Versione 1.4.0 (beta) — prima prova con i primi utenti

### 1.4.0-beta.9 — professionisti e imprese di servizi

- **Tre profili:** studio legale, libero professionista e ditta individuale, con incarichi o commesse e documenti/incassi. Le personalizzazioni precedenti non cambiano automaticamente.
- **Preventivi e lavori:** validità, esito, avvio del lavoro e conversione in una bozza con numerazione propria, senza duplicare l'originale.
- **Budget e consegne:** ore e importo concordati, data di consegna e confronto con il lavoro registrato.
- **Pagamenti dettagliati:** data, importo e metodo, residuo ricalcolato e conservazione dei cumulativi precedenti.
- **Costi e fornitori:** costi generali o del lavoro, scadenze, pagamenti e rimborsi previsti.
- **Attività ricorrenti:** compiti settimanali, mensili o annuali, con gestione di fine mese e protezione dai duplicati dopo una pausa.
- **Documenti:** contributo/rivalsa configurabile, trattamento della base della ritenuta e CSV di destinatari e voci per il servizio fiscale esterno.
- **Dati:** schema 5 con migrazione e backup/ripristino verificati. Conservare un backup prima di aggiornare; il nuovo archivio richiede questa build o una successiva.

### 1.4.0-beta.8 — ultima prova interna prima di TIO 1.0

- **Calendari:** pulsante di aggiunta con il solo «+», nome accessibile e spiegazione al passaggio del mouse; pallino colorato accanto al nome di ciascun calendario, con controlli di disposizione a tre larghezze.
- **Pratiche dagli eventi:** numeri di ruolo uguali presso uffici diversi non accorpano più fascicoli distinti. Conservate le scelte delle build precedenti quando l'abbinamento resta riconoscibile.
- **Integrazioni:** chiariti i limiti di esportazione di Cliens Più e il requisito di un feed o file ICS per Cube; aggiunta una prova del formato Google con ricorrenze al cambio di ora. La prima versione pubblica resta **1.0.0**.

### 1.4.0-beta.7

- **Sicurezza:** Electron 44.9.3, dipendenze di build aggiornate e percorsi/URL rimossi dal registro degli errori.
- **Scadenze sempre aggiornate:** Panoramica, Agenda, pratiche e contatori seguono il passare del tempo e la ripresa del computer.
- **Leggibilità:** titoli dei compiti su due righe e indicatori della Panoramica senza etichette tagliate.
- **Download:** scelta esplicita Mac Apple Silicon, Mac Intel e Windows, gestione della prima beta, link disponibili anche senza API e contrasto corretto nella scena chiaro/scuro. Requisito Mac: macOS 13 Ventura o successivo.
- **Verifiche di rilascio:** regressioni su orologio, registro e sito; prova del pacchetto finale e controlli del sito nei workflow.

### 1.4.0-beta.6

- **Avviso delle nuove versioni:** dopo il primo avvio TIO chiede una volta se avvisarti quando esce una versione nuova («Avvisami» o «Non ora»); con il sì controlla una volta al giorno su GitHub e lo segnala nel campanello e con una notifica. Chi usa una beta riceve anche le beta successive. Gli installer creati su GitHub sanno da soli dove controllare.
- **Profilo ditta:** Agenda, scheda del lavoro, Panoramica e stampa dell'agenda parlano di «scadenze e appuntamenti», senza udienze.
- **Pagina di download:** più domande e risposte per tutti i profili, impaginazione per telefono e tablet.

### 1.4.0-beta.5

- **Nuova icona:** fondo bordeaux come la pagina di download, penna color carta e tratto rosa (Dock, barra delle applicazioni, installer).
- **Pagina di download** nella cartella `sito/`, pubblicabile su GitHub Pages: pulsante per il sistema di chi visita, TIO in movimento, confronto «senza TIO / con TIO», passaggio dal tema chiaro allo scuro, passi d'installazione per Mac, Windows e Linux.

### 1.4.0-beta.4

- **Pratiche dal calendario (Cliens Cube e simili).** Cliens Cube non offre un accesso per altri programmi, ma il suo calendario sì: in **Impostazioni → Integrazioni**, il pulsante **Pratiche…** di un calendario collegato riconosce negli eventi intestazione delle parti («Rossi c/ Bianchi»), numero di ruolo, ufficio giudiziario e giudice (dal titolo, dalle etichette della descrizione come «Ruolo:», «Curia:», «Istruttore:» e dal luogo), mostra l'anteprima e importa le pratiche scelte collegandovi gli eventi. Con «Crea in automatico» le nuove arrivano a ogni aggiornamento del calendario, con un avviso nel campanello. Niente doppioni (abbinamento per R.G. o intestazione, poi ricordato anche se rinomini la pratica), nessuna sovrascrittura (delle esistenti si completano solo i campi vuoti), gli eventi collegati a mano restano dove sono e le pratiche escluse o eliminate non vengono ricreate. Arrivano solo le pratiche con almeno un evento nel periodo importato (da 40 giorni prima a 400 dopo).
- **Mac:** l'app è firmata «ad-hoc» (firma locale gratuita, senza account Apple): al primo avvio macOS propone «Apri comunque» invece di dichiararla danneggiata. Resta non notarizzata.
- **Pubblicazione:** README per chi installa, storico delle versioni (questo file) e guida per chi sviluppa ([SVILUPPO.md](SVILUPPO.md)) separati; le versioni beta escono su GitHub come *pre-release*, con i codici di controllo SHA-256 degli installer.

### 1.4.0-beta.3

- Scaglioni a valore indeterminabile come nei calcolatori di avvocatoandreani.it (complessità bassa, media, alta, particolare importanza): importi calcolati, non più 0 €.
- Calendari: un link di condivisione di Google o la pagina HTML di Outlook incollati per errore vengono riconosciuti con la spiegazione di quale link copiare; si può collegare un file `.ics` già scaricato, riletto a ogni aggiornamento.
- In Impostazioni la sezione si chiama solo «Identità».

### 1.4.0-beta.2

- Su Windows backup automatici e documenti creati da TIO vanno nella cartella utente (`TIO Backup`, `TIO`) invece che in Documenti, che la protezione ransomware di Windows («Accesso alle cartelle controllato») blocca ai programmi non firmati; ogni scrittura negata spiega come consentire TIO o scegliere un’altra cartella, e dopo un blocco il backup automatico riprova ogni 6 ore invece che ogni 5 minuti.
- Il registro locale annota i blocchi: se il programma resta fermo più di 2 secondi o la finestra non risponde, scrive per quanto e qual era l’ultima operazione.
- Tolta per ora la funzione «Atto da uno esistente» (recuperabile dalla cronologia Git, commit d94ce90 e precedenti); note pro forma, parcelle e preventivi restano.

### 1.4.0-beta.1

- Al primo avvio il benvenuto avvisa che compensi e termini sono indicativi e che l’archivio non è cifrato. La prima volta che si chiude la finestra una notifica spiega che TIO resta attivo per gli avvisi.
- Gli errori finiscono nel file locale `registro.log`, che **Aiuto › Segnala un problema** aiuta ad allegare a una segnalazione: TIO non invia nulla da solo. Il registro annota anche i tempi di avvio (sul Mac Apple Silicon i dati compaiono in circa 0,6 s anche con 1.500 pratiche).
- **Controllo degli aggiornamenti, facoltativo e spento di default** (Impostazioni → Backup e sicurezza → Aggiornamenti; menu **TIO › Controlla aggiornamenti…** su Mac, **Aiuto › Controlla aggiornamenti…** su Windows e Linux): al massimo una volta al giorno chiede a GitHub il numero dell’ultima versione pubblicata; non scarica né installa nulla. Si attiva quando `package.json` contiene il campo `repository`. Le pre-release non vengono proposte. Dettagli in [PRIVACY.md](PRIVACY.md).
- **Pacchetto più leggero:** gli installer non includono le parti di PDF.js e Tesseract che l’app non carica. Windows: installer da 147 a 131 MB, app installata da 484 a 422 MB; Mac da 390 a 328 MB.
- Calcolo dei termini processuali (sperimentale), finestre interne del Mac sotto i pulsanti della finestra, avviso prima di emettere una parcella senza IVA o CPA.

## Dopo la 1.3.3 — modello PDF

In **Impostazioni → Modello PDF**, l’anteprima deriva dal PDF effettivo e adatta il foglio intero alla finestra. I modelli estesi si consultano una pagina alla volta, senza scorrimento interno. Numero e destinatario sono più vicini; il riepilogo condivide i margini delle altre tabelle. Intestazione e piè di pagina possono contenere immagini e righe di testo con font differenti.

Il font del documento si può scegliere o importare da file TTF, OTF, WOFF e WOFF2 (2 MB per file, quattro font e 4 MB complessivi). I font importati sono conservati nel database e nei suoi backup e incorporati nei PDF quando usati. Usare font con una licenza che consenta tale utilizzo; i caratteri standard dipendono da quelli disponibili sul sistema. Nessun font dell’utente viene aggiunto ai sorgenti del progetto. Gli installer 1.3.3 già generati precedono questo aggiornamento.

Verifica dedicata: `sh scripts/run-smoke.sh /tmp/mngmnt-modello smoke-modello-layout`.

## Versione 1.3.3 — verifiche di sicurezza e pubblicazione

Aggiornato Electron a 44.7.2. La stampa dei PDF usa una cartella temporanea privata e una sessione isolata senza rete; rafforzati navigazione, permessi web e CSP di produzione. I calendari interrompono il download oltre 25 MB, anche senza dimensione dichiarata. Il controllo dei file da pubblicare comprende anche radice, workflow e licenze.

Inclusa la nuova impaginazione di **Backup e sicurezza**, con gruppi di preferenze, interruttori accessibili e dettagli espandibili. Le tabelle dei due decreti sono state riprodotte dagli allegati ufficiali senza differenze. La ricerca preliminare del nome ha individuato risultati da approfondire: **non è attestata la disponibilità di TIO come marchio**.


## Versione 1.3.2 — licenze native e sorgenti disponibili

In **Impostazioni → Backup e sicurezza → Informazioni**, i comandi **Licenze e componenti** e **Cartella licenze e sorgenti** aprono avvisi completi e sorgenti delle parti MPL e dei font Liberation, disponibili anche offline. La MIT del progetto resta invariata; le parti esterne mantengono le proprie condizioni.

Le build verificano versioni e impronte dei componenti nativi, avvisi e sorgenti prima e dopo l’impacchettamento. Il sandbox QuickJS di PDF.js, inutilizzato e privo di avvisi nel pacchetto upstream, è escluso dagli installer. Dettagli: [audit licenze native](AUDIT-LICENZE-NATIVE-1.3.2.md).

## Versione 1.3.1 — recupero, backup cifrati e revisione delle importazioni

Il ripristino registra le operazioni sul disco: dopo un’interruzione l’app recupera l’archivio precedente prima di aprire SQLite. Anche le migrazioni sono atomiche. I dati usano **schema 4**: conserva un backup precedente all’aggiornamento e non aprire il nuovo archivio con versioni vecchie.

In **Impostazioni → Backup e sicurezza → Cifra i backup automatici…** puoi scegliere una password di almeno 12 caratteri. L’app la ricorda usando il portachiavi del sistema; conservala anche in un luogo sicuro fuori dal computer per ripristinare le copie su un’altra postazione. Se il portachiavi non è disponibile, la copia automatica cifrata si ferma e segnala l’errore. Le copie precedenti mantengono la loro password o restano in chiaro; cambiare l’impostazione non le converte. La cifratura è facoltativa e non viene attivata sui dati dell’utente durante i test.

Le importazioni conservano il netto originale e lo stato di verifica anche dopo la chiusura. Puoi salvare una bozza da controllare; PDF ed emissione richiedono conferma dei dati. Modificare voci, importi o destinatario richiede una nuova verifica. Gli acconti sono segnalati e non vengono sottratti automaticamente. Il bollo letto dal documento è conservato nell’editor.


## Versione 1.3.0 — integrità dei dati e importazione pro forma


**Parcelle → Importa PDF / Word** legge localmente il PDF testuale o il `.docx` esportato dal proprio strumento di fatturazione/calcolo, compresi i riepiloghi di AvvocatoAndreani. Mostra compensi aggregati, spese riconosciute, aliquote e confronto del netto; apre poi una bozza modificabile della nota pro forma. Cliente, pratica, data e oggetto si completano nell’editor. Il salvataggio assegna il numero della serie PF. File senza testo, aliquote non riconoscibili e voci ambigue vengono rifiutati; eventuali differenze nei totali sono evidenziate. Non importa XML FatturaPA o vecchi `.doc` e non invia il documento al sito.

La versione corregge gli 11 problemi dell’audit: impronte SHA-256 complete per i documenti, indici aggiornabili, operazioni isolate dopo ripristino, verifica delle copie di backup, gestione delle serie e lettura ZIP limitata. I backup cifrati non depositano più contenuto in chiaro sulla destinazione. I backup precedenti restano leggibili, con indicazione quando mancano le impronte. La 1.3.0 usava schema 3; la versione corrente usa schema 4.

I parametri derivano dai decreti ufficiali; l’app non interroga più il sito privato e non usa la vecchia cache. Il PDF della pro forma usa un modello autonomo. Licenze, flussi dei dati e limiti sono descritti in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [PRIVACY.md](PRIVACY.md) e [SECURITY.md](SECURITY.md).

## Versione 1.2.0 — nuova interfaccia desktop

Revisione ispirata alle [Human Interface Guidelines Apple](https://developer.apple.com/design/human-interface-guidelines): sidebar leggera con gruppi Lavoro/Gestione, barra con il contesto della pagina, dashboard con gerarchia più chiara e azioni ordinate. Controlli, schede, tabelle, agenda e finestre seguono una scala visiva coerente nei temi chiaro e scuro.

La sidebar si può nascondere e ripristinare; la preferenza resta sul computer. Movimento e trasparenza ridotti e contrasto aumentato rispettano le preferenze disponibili nel browser integrato. La revisione è realizzata in CSS per Electron; non utilizza asset Apple né il materiale Liquid Glass nativo.

La verifica UI dedicata si esegue con `sh scripts/run-smoke.sh /tmp/mngmnt-hig smoke-hig`.

## Versione 1.1.0 — revisione di affidabilità

- Backup verificati prima del ripristino e recupero automatico in caso di errore.
- Ripristino impedito durante un backup o se il journal SQLite è ancora in uso; i file precedenti sono conservati anche se il recupero automatico incontra un secondo errore.
- Backup portabili con documenti collegati e backup manuali cifrati con password separata (AES-256-GCM). Verifica guidata senza sostituire i dati.
- Stato dei backup visibile; destinazione non disponibile segnalata e nuovo tentativo dopo cinque minuti. Copia dei backup eseguita in un worker per mantenere reattiva l’interfaccia.
- Notifiche riservate per impostazione predefinita e dettagli sempre nascosti quando l’app è bloccata. Una configurazione password danneggiata impedisce l’accesso e mostra un errore esplicito.
- Validazione degli ID, dei percorsi, delle date e degli importi nel processo principale; protezione dei file interni dai collegamenti simbolici; annullamenti tramite istantanee conservate nel backend.
- Anteprima di PDF e immagini in una finestra isolata, chiusa automaticamente al blocco dell’app.
- Ricerca nel testo dei PDF e OCR locale per PDF/immagini: solo italiano (l'app è pensata per i professionisti italiani), nessun invio dei documenti in rete. I PDF testuali vengono indicizzati in background; per scansioni usa **Documenti → Leggi con OCR**. Limiti: 60 MB, PDF testuali fino a 1.000 pagine, OCR PDF fino a 20 pagine. PDF protetti da password richiedono una copia leggibile. Un indicatore nei documenti mostra stato e problemi.
- Incassi parziali e scadenza esplicita di pagamento, con residui corretti nel cruscotto e nei solleciti; serie autonoma per i preventivi (`PR`). Il dato degli incassi è cumulativo e non rappresenta un registro bancario dei singoli movimenti.
- Conferma per modifiche non salvate, navigazione da tastiera confinata alle modali, contenuto sottostante inerte, messaggi di errore del caricamento con Riprova.
- Paginazione di pratiche, compiti, anagrafica e documenti economici; filtri pratiche memorizzati; vista compatta; pagine caricate su richiesta.
- Icona «Firma» (pennino e tratto, sorgente `build/icon.svg`) con icona monocromatica della barra di sistema macOS in tinta. Si rigenera con `npm run icon`.
- Licenza MIT per codice e asset originali. Nessun repository è stato creato o pubblicato.

I backup automatici sono in chiaro finché non attivi la cifratura nella sezione Backup e sicurezza. «Backup cifrato…» protegge una singola copia manuale e richiede una password di almeno 12 caratteri. La password automatica viene ricordata tramite il portachiavi di sistema, separatamente da SQLite e dai backup. Il database attivo resta SQLite non cifrato: per il computer serve la cifratura del disco. Per recuperare un `blocco.json` danneggiato, ripristina il file originale da una copia sicura; non viene aggirato il blocco.

L’app è destinata al singolo professionista su una postazione. La cronologia è un diario operativo, non un registro immutabile multiutente. I PDF e la prima nota aiutano il lavoro; invio SDI, conservazione fiscale e adempimenti restano nel servizio fiscale del professionista.
