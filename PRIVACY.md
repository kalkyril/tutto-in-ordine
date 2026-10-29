# Dati e riservatezza in TIO

Aggiornato al 27 ottobre 2026, versione 1.0.0. Questa è una descrizione tecnica del programma distribuito: non sostituisce l’informativa che ciascuno studio deve fornire ai propri clienti.

## Dove sono i dati

Pratiche, anagrafiche, note, attività, parcelle, calendari, cronologia, notifiche e testo estratto dai documenti sono conservati nel database SQLite locale. I documenti collegati restano nelle cartelle scelte dall’utente; i PDF creati dall’app vengono salvati dove indicato. L’indicizzazione e l’OCR italiano/inglese avvengono sul computer, senza servizi AI remoti o download di modelli durante l’uso.

Immagini e font importati nel modello PDF vengono conservati nel database, inclusi nei suoi backup e incorporati nei documenti generati quando utilizzati. Anche le anteprime PDF sono elaborate localmente: il PDF intermedio e l’immagine dell’anteprima sono tenuti in memoria, con le stesse protezioni per l’HTML temporaneo descritte sotto. Non vengono scaricati font da servizi esterni.

Il testo indicizzato è una copia del contenuto ed è presente anche nei backup del database. Eliminare un collegamento elimina l’indice associato dal database corrente, ma non le copie di backup o l’originale. La cancellazione ordinaria non è una bonifica forense del disco. I dati in memoria possono restare fino alla chiusura del processo.

Non sono implementati account del fornitore, telemetria, pubblicità o invio automatico di crash. Non è necessario Vercel o un server per usare il gestionale locale.

Gli errori del programma vengono annotati nel file locale `registro.log`, nella cartella dati (oltre mezzo megabyte diventa `registro.log.1` e se ne apre uno nuovo). Contiene data e ora, versione del programma e del sistema, il punto del programma e il messaggio d’errore, oltre ai tempi di avvio (quanto impiegano finestra e dati a comparire); i percorsi locali e gli URL sono rimossi dai nuovi messaggi. Non viene inviato da nessuna parte: «Aiuto › Segnala un problema» mostra il file, che l’utente può allegare a mano a una segnalazione. Un messaggio d’errore può citare altri dati inseriti; i registri precedenti possono contenere percorsi e nomi di file. Controllare il registro e rimuovere eventuali informazioni riservate prima di inviarlo.

## Quando escono dati dal computer

| Azione | Destinazione e contenuto |
| --- | --- |
| Collegare/provare/sincronizzare un calendario | Richiesta GET all’URL scelto, con IP, User-Agent e possibile ETag; il server restituisce gli eventi. Il link può contenere un token riservato. Eventuali redirect seguono le indicazioni del server. Un file .ics scelto dall’utente viene solo letto dal disco, a ogni aggiornamento, senza richieste di rete. Le pratiche ricavate dagli eventi (Impostazioni › Integrazioni › Pratiche…) si creano sul computer: nel calendario non viene scritto nulla. |
| Calcolo dei parametri | Nessuna richiesta: tabelle normative incluse. Le vecchie impostazioni online e cache esterne non riattivano il servizio privato. |
| Importare PDF/Word | Lettura del file locale scelto, senza invio al sito da cui proviene. Nessuna esecuzione di macro o collegamenti del documento. |
| Aprire un collegamento, mail o telefono | Si apre il programma esterno indicato; il suo utilizzo dipende dalle relative impostazioni. Un messaggio preparato può contenere dati: controllarlo prima dell’invio. |
| Backup/esportazione | Copia nella destinazione scelta. Una cartella cloud o condivisa può trasmettere i file tramite altri programmi. |
| Controllo degli aggiornamenti (facoltativo, spento di default) | Solo se attivato: TIO lo chiede una volta dopo il primo avvio («Avvisami» o «Non ora»), poi si cambia in Impostazioni › Backup e sicurezza › Aggiornamenti; al massimo una volta al giorno (dopo un errore, non prima di 6 ore), oppure quando l’utente sceglie «Controlla ora» o «Controlla aggiornamenti…». Una richiesta GET a `api.github.com` per leggere il numero dell’ultima versione pubblicata del progetto (a chi usa una beta, l’elenco delle ultime versioni pubblicate), con IP, User-Agent `TIO/<versione in uso>` e intestazioni standard: nessun dato dell’archivio, cookie o identificativo. GitHub tratta i dati di connessione secondo le proprie condizioni. Se c’è una versione nuova TIO lo segnala e, su richiesta, apre la pagina di download nel browser. |
| Anonimizza e Documenti | Nessuna richiesta: il testo viene letto e analizzato sul computer e i file si salvano solo dove scegli. Anonimizza tiene il documento in memoria finché TIO è aperto (si svuota con il blocco). La chiave di ripristino contiene i dati originali: viene salvata solo se lo chiedi. L’anonimizzazione è automatica e può sbagliare: controlla il risultato prima di condividerlo. |
| Installazione da GitHub e aggiornamento manuale | Il browser e il servizio di download trattano i dati di connessione secondo le loro condizioni; l’app non scarica né installa aggiornamenti da sola. |
| Visitare la pagina di download | Pagina statica su GitHub Pages, senza cookie, statistiche o caratteri e script di terzi. Il browser chiede a `api.github.com` l’ultima versione pubblicata; GitHub riceve IP e User-Agent come per ogni sito che ospita, secondo la propria informativa. |

Non condividere URL privati dei calendari in issue, screenshot o backup pubblici. Preferire HTTPS; HTTP non protegge il trasporto. Chi possiede un link con token può spesso leggere il calendario: in caso di esposizione revocare o rigenerare il link nel servizio di origine.

## File temporanei di stampa

Per generare un PDF l’app crea un HTML in una cartella temporanea casuale, privata all’utente su macOS (cartella 0700, file 0600). La finestra di stampa ha JavaScript disabilitato, una sessione isolata e può leggere solo quell’HTML e risorse incorporate `data:`: richieste in rete e riferimenti ad altri file locali sono bloccati. La cartella viene eliminata al termine, anche in caso di errore gestito. Un arresto forzato può lasciare residui privati nel percorso temporaneo; non è una cancellazione forense. Su Windows la riservatezza dipende anche dalle ACL della cartella temporanea dell’account.

## Protezione della postazione e delle copie

Il blocco con password limita l’accesso dall’interfaccia: **non cifra SQLite, gli indici o i file collegati**. Usare account personali del sistema, blocco della sessione e cifratura del disco (FileVault, BitLocker o equivalente). Su macOS la cartella dati dell’app viene resa privata all’utente; su Windows la protezione dipende dalle ACL dell’account.

I backup automatici sono in chiaro finché non si attiva la cifratura opzionale. I backup manuali senza password restano in chiaro. Le copie cifrate usano una password separata di almeno 12 caratteri: conservarla anche fuori dal computer, perché senza di essa non si possono recuperare su un’altra postazione. Per le copie automatiche la password viene protetta tramite il portachiavi del sistema e memorizzata nel file locale `backup-key.json`, escluso dai backup; non entra in SQLite o nei log. La scelta di cifrare resta in SQLite anche se la chiave locale viene persa o si ripristina su un altro computer; occorre configurare nuovamente la password per le copie successive. Se la chiave manca o il portachiavi non è disponibile, il backup cifrato si interrompe senza ripiegare in chiaro. Cambiare password o disattivare la cifratura non modifica le copie precedenti. Durante la creazione di un backup cifrato, i dati intermedi rimangono nella cartella locale privata; una chiusura forzata può lasciare residui locali, come il database attivo già non cifrato. La destinazione riceve solo ciphertext. I checksum dei backup in chiaro rilevano alterazioni accidentali; non autenticano un backup contro chi può riscrivere anche il manifest.

## Responsabilità d’uso

Lo studio/professionista determina finalità, basi giuridiche, autorizzazioni, conservazione e destinatari del trattamento e deve valutare gli obblighi GDPR, anche per dati particolari o giudiziari. Distribuire solo il software locale, senza ricevere i dati, non equivale automaticamente a ospitarli o trattarli per conto dello studio: è una valutazione del modello concreto. Assistenza con accesso ai dati, telemetria, sincronizzazione o hosting cambierebbero questa analisi.

Prima di usare dati reali: stabilire le misure organizzative, fornire le informative necessarie, definire tempi di conservazione e provare un ripristino. La cronologia è un diario modificabile, non un audit log certificato. Il programma non implementa un sistema multiutente con ruoli e separazione degli archivi per studi diversi.

Fonte istituzionale: [Garante, misure di sicurezza](https://garanteprivacy.it/temi/cybersecurity/misure-di-sicurezza) e [principi del trattamento](https://www.garanteprivacy.it/web/guest/home/principi-fondamentali-del-trattamento).

Il ripristino crea un registro locale temporaneo e una copia di sicurezza non cifrata dell’archivio corrente, nella cartella privata dei dati. La cifratura automatica non si applica a questa copia locale di emergenza. Un’interruzione prima del completamento causa il recupero dell’archivio precedente all’avvio. Le aree temporanee rimangono nella cartella privata in caso di recupero non riuscito; non pubblicarle. La verifica delle importazioni conserva il netto originale e la data di conferma nella parcella, senza copiare il documento sorgente o il suo nome.
