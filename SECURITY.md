# Sicurezza

## Stato e ambito

Versione corrente: 1.0.0, prima versione pubblica. Il gestionale è pensato per un singolo professionista su una postazione locale protetta. Non sono dichiarate certificazioni GDPR, sicurezza, conservazione o conformità fiscale. Le verifiche eseguite sono documentate nelle note del rilascio e non escludono difetti ancora sconosciuti.

Sono previsti isolamento del renderer, sandbox, CSP, verifica del mittente IPC, validazione dei percorsi, lettura documenti in worker limitati, backup verificati prima della sostituzione dei dati e ripristino con recupero in caso di errore. Gli annullamenti e le letture asincrone vengono legati all’archivio di origine.

La navigazione principale è limitata all’URL esatto dell’app; la CSP di produzione blocca connessioni, frame, oggetti e invii di moduli dal renderer. I permessi web non necessari sono negati in tutte le sessioni; soltanto la scrittura degli appunti è ammessa dalla finestra principale autorizzata. Le notifiche native continuano a essere gestite dal processo principale. La stampa usa file temporanei privati e una sessione isolata senza rete o letture di altri file locali. I calendari interrompono la lettura appena superano 25 MB, anche senza Content-Length.

Il database e il contenuto indicizzato sono in chiaro. Il blocco dell’interfaccia non protegge da malware o da chi può leggere il disco. I backup automatici sono cifrabili facoltativamente; restano in chiaro fino all’attivazione. La chiave locale protetta dal portachiavi non viene inclusa nei backup. In caso di portachiavi non accessibile non viene creata una copia automatica in chiaro. Leggere [PRIVACY.md](PRIVACY.md) prima di trattare dati reali.

Le anteprime PDF usano lo stesso motore di stampa isolato e vengono rasterizzate in un worker locale, con valutazione di codice disabilitata. Le richieste in attesa vengono accorpate; il rendering dell’immagine ha un limite di tempo, pagine e pixel. I font importati sono limitati per numero/dimensione e inseriti nel CSS solo con identificatori generati e dati incorporati validati; l’importazione verifica il formato e la leggibilità, non la licenza d’uso del font.

## Segnalare un problema


Prima della pubblicazione il manutentore deve attivare un canale privato verificabile: preferibilmente Private Vulnerability Reporting nella sezione Security del futuro repository, oppure un indirizzo dedicato. Il repository non esiste ancora e questo documento non inventa un contatto o dichiara un servizio attivo.

Una segnalazione dovrebbe contenere versione, sistema operativo, passaggi minimi e risultato atteso/ottenuto. Utilizzare dati sintetici. Non pubblicare database, atti, PDF di clienti, password, token dei calendari, percorsi personali, screenshot riservati o backup nelle issue. Per una vulnerabilità ancora sfruttabile, utilizzare il canale privato effettivamente attivato dal manutentore.

## Manutenzione e rilascio

- Usare Node nella versione indicata dal progetto e installare con `npm ci` dal lockfile. L’override di `global-agent` rimuove la catena vulnerabile di `sprintf-js`; verificare anche la compilazione degli installer a ogni modifica.
- Eseguire `npm test`, `npm audit`, `npm audit --omit=dev` e gli scenari UI. Controllare gli avvisi, analizzarne l’effettivo utilizzo e correggerli senza applicare downgrade forzati alla cieca.
- Generare gli avvisi con `npm run licenses`; verificare le licenze dei nuovi componenti, modelli, font e moduli nativi. La raccolta nativa corrente è documentata in AUDIT-LICENZE-NATIVE-1.3.2.md; eseguire `npm run licenses:check` e `npm run test:licenses`. Le build verificano anche il pacchetto finale. Un cambio di versione o binario richiede nuova revisione di avvisi, sorgenti e dipendenze incorporate.
- Prima di distribuire installer: verificarli sul sistema/architettura destinatario, firmarli con credenziali controllate dal titolare e, su macOS, notarizzarli. Pubblicare hash e inventario insieme alla versione. Gli installer locali non firmati non sono notarizzati.
- Gestire gli aggiornamenti di sicurezza delle versioni distribuite e conservare una descrizione delle vulnerabilità corrette. Non è stato assunto un impegno di assistenza o una durata di supporto che il manutentore non abbia deciso.

In caso di fuga di dati, lo studio deve valutare le azioni e gli obblighi di notifica applicabili con il proprio referente privacy; il manutentore deve distinguere incidente del progetto, vulnerabilità del software e incidente della postazione dell’utente.

## Recupero e compatibilità

Schema corrente: 5. Le migrazioni avvengono in una transazione; un archivio di una versione futura viene rifiutato prima delle migrazioni. Il registro persistente del ripristino consente il recupero all’avvio dopo un crash. Se registro o area di recupero sono danneggiati, l’app interrompe l’apertura e conserva i file, senza avviare un archivio vuoto. I test con SIGKILL verificano interruzioni di processo, non guasti fisici del disco. Su Windows Node non espone il flush delle directory: è necessaria una prova sul filesystem di destinazione.

La password automatica usa le API asincrone di [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage). Le garanzie dipendono dal sistema operativo. Su macOS una firma coerente evita problemi di riconoscimento tra build; gli installer attuali non sono firmati. I test automatici della configurazione usano un adattatore isolato e non certificano il comportamento del portachiavi dopo aggiornamento del sistema o dell’app.
