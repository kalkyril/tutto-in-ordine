# Revisione di pratiche, archivio e prestazioni

## Esito

Il limite è di 25 contatti distinti per pratica, inclusi i principali. Il conteggio usa l’identificativo di rubrica, così due omonimi contano separatamente e una persona con più ruoli conta una volta. Una pratica storica sopra soglia può conservare i suoi contatti, cambiare i loro ruoli e ridurne il numero. Per introdurre un nuovo nominativo deve rientrare nella soglia. Il controllo si applica allo stato finale che SQLite sta per salvare, anche se il modulo era stato aperto prima di un’altra modifica.

La promozione a cliente principale mantiene il precedente intestatario tra i clienti della pratica. Le nuove parcelle propongono il cliente promosso anche quando in Anagrafica è classificato come controparte. I documenti già emessi conservano il loro intestatario. La cronologia registra i nomi e i ruoli cambiati con una voce per pratica e salvataggio. Una prova di rollback verifica anche che un salvataggio rifiutato lasci intatta la cronologia.

## Costo di un salvataggio

La prova locale usa un archivio sintetico con 20.000 contatti, 2.000 pratiche e 20 partecipanti iniziali per pratica. L’operazione modifica la nota di un contatto e lo collega come fornitore a una pratica. La misura riguarda le righe restituite dalle letture di aggiornamento e la loro dimensione serializzata in JSON.

| Letture di aggiornamento | Contatti | Pratiche | Byte JSON |
| --- | ---: | ---: | ---: |
| Rilettura delle due tabelle intere | 20.000 | 2.000 | 10.000.300 |
| Lettura degli ID interessati | 1 | 1 | 1.563 |

Le notifiche ravvicinate vengono riunite. Una notifica di importazione o ripristino che richiede una tabella intera ha precedenza sulle letture parziali di quella tabella. I caricamenti sono serializzati per conservare l’ordine degli aggiornamenti. La vista conserva l’ordinamento anche quando si rinomina o si elimina un contatto. [Caricamento dello stato](../src/store.tsx) · [Aggiornamenti delle righe](../src/lib/aggiornamentiRighe.ts)

## Avvio, documenti e archivi grandi

- La Panoramica apre le tabelle che alimentano indicatori e attività. Rubrica, documenti, note e collegamenti vengono richiesti insieme alla prima apertura di un’altra pagina o di un modulo di modifica. Il test Electron apre la Panoramica con altri 20.000 contatti e controlla le tabelle effettivamente lette. Il costo di caricare questi quattro elenchi si sostiene una volta per finestra, quando si prosegue oltre la Panoramica. [Caricamento iniziale](../src/store.tsx)
- Le pagine sono caricate su richiesta. PDF e OCR utilizzano librerie locali e worker dedicati per le elaborazioni pesanti. La build dell’interfaccia esaminata occupa circa 1,12 MB di file, con circa 308 kB di JavaScript nel blocco iniziale. Il pacchetto desktop comprende anche Electron, i font e i motori documentali. [Caricamento delle pagine](../src/App.tsx) · [Worker documentale](../electron/document-worker.js)
- Il limite di 25 circoscrive la dimensione di ogni nuova pratica. La ricerca inversa di tutte le pratiche di un contatto deve ancora esaminare i partecipanti aggiuntivi memorizzati in JSON. Se le misure su archivi reali mostrano un rallentamento, una tabella di associazione con indice sul contatto è il passo successivo. Richiederebbe una migrazione e prove di ripristino dedicate. [Archivio SQLite](../electron/db.js)
- Aprendo una pratica, SQLite usa l’indice sulla cronologia per leggere al massimo nove voci. L’interfaccia mostra le otto più recenti e usa la nona per abilitare «Mostra tutte». Solo quel comando richiede lo storico completo. [Cronologia della pratica](../src/components/pratica/CronologiaCard.tsx)

## Misura di apertura

Nel collaudo locale su macOS con 20.000 contatti sintetici aggiuntivi, il primo pulsante utilizzabile della Panoramica è comparso dopo 349 ms dalla navigazione. A quel punto il processo della finestra occupava 138 MiB di memoria residente. Si tratta di una singola riapertura della finestra con Electron già avviato. Il test registra i valori misurati su ogni macchina e verifica quali tabelle sono state lette, senza imporre una soglia di tempo dipendente dall’hardware.

## Ripetibilità delle prove

Il workflow di verifica esegue l’audit delle dipendenze, la suite generale e gli scenari Electron in modalità rigorosa su runner macOS e Windows con Node 24. Il registro della suite e quelli dei singoli scenari sono disponibili negli artefatti di ciascun runner. La suite verifica la soglia, gli archivi storici, i rollback e l’aggiornamento per ID. Lo scenario di interfaccia verifica anche la promozione, la cronologia visibile e la selezione dei ruoli a pratica piena. [Workflow](../.github/workflows/build.yml) · [Prove sull’archivio](../scripts/test-novita-103.mjs) · [Prove nell’app](../scripts/smoke-103.js)

Nel collaudo locale del 19 novembre 2026 su macOS sono passati al primo tentativo tutti i 24 scenari Electron, con 892 controlli. Il test sulle parcelle ha verificato sia l’intestatario proposto dopo la promozione sia quello dei documenti emessi in precedenza. L’esito su Windows sarà disponibile dopo il push su `main` o l’apertura di una pull request.
