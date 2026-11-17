# TIO Mobile — studio di fattibilità

Novembre 2026, sulla base di TIO 1.0.4. Obiettivo: vedere e, in parte, modificare dal telefono i dati di TIO che stanno sul computer, senza cambiare il principio di TIO: **i dati restano sul tuo computer, nessun server, nessun account**.

## In breve

- **Fattibile**, a patto di accettare un limite: il telefono parla con il computer, quindi **il computer deve essere acceso** e raggiungibile.
- **Da fare subito, con poca spesa:** l'agenda di TIO nel calendario del telefono, con gli avvisi, tramite un link di sola lettura servito dal computer (circa 1 settimana).
- **Passo successivo:** un'app mobile vera (React con Capacitor, riusando gran parte dell'interfaccia attuale), collegata al computer con un codice QR, prima in sola lettura e poi con poche azioni rapide (circa 6–8 settimane).
- **Decisione che spetta a te:** su iPhone un'app installabile richiede l'**Apple Developer Program (99 $ l'anno)** e la revisione dell'App Store. Oggi TIO non ha firma Apple a pagamento. Su Android basta pubblicare il file `.apk` su GitHub, come per Mac e Windows.
- **Da evitare:** una copia dei dati su un server o un servizio cloud di TIO. Cambierebbe la natura del progetto (privacy, costi, responsabilità, Cyber Resilience Act per un servizio).

## Cosa deve fare TIO Mobile

| Priorità | Funzione | Note |
| --- | --- | --- |
| Alta | Agenda di oggi e della settimana, con avvisi | il bisogno più frequente fuori dallo studio |
| Alta | Ricerca: clienti, pratiche, telefoni, indirizzi, RG | «chi è / dov'è / che numero ha» |
| Alta | Scheda della pratica: persone, scadenze, compiti, note | sola lettura nella prima versione |
| Media | Spuntare un compito, aggiungere una nota o una scadenza | scritture piccole, applicate dal computer |
| Media | Aprire un documento della pratica (PDF) | lettura; i file pesanti solo su richiesta |
| Bassa | Fatture, pagamenti, modelli, Editor PDF | restano sul computer |

## Le strade possibili

### 1. Calendario del telefono abbonato all'agenda di TIO (consigliata subito)

Il computer pubblica sulla rete di casa o dello studio un link `webcal://` con un codice segreto. Il Calendario dell'iPhone o Google Calendar su Android si abbona: udienze, scadenze e avvisi compaiono nell'app che la persona usa già, con le notifiche native.

- **Pro:** nessuna app da installare, nessun costo, le notifiche funzionano davvero; TIO sa già creare file `.ics` (`electron/ics.js`).
- **Contro:** il calendario si aggiorna solo quando il telefono è sulla stessa rete del computer acceso; è sola lettura.
- **Sicurezza:** link con un codice lungo e revocabile, solo rete locale, nessun dato oltre l'agenda.
- **Impegno:** circa 1 settimana, prove comprese.

### 2. Pagina web servita dal computer (web app)

Il computer apre un piccolo server sulla rete locale; il telefono apre una pagina dopo aver inquadrato un QR.

- **Ostacolo tecnico decisivo:** per installarla, lavorare senza rete e usare la crittografia del browser serve **HTTPS**. Sulla rete locale il computer può avere solo un certificato fatto da sé, che iPhone e Android rifiutano finché non si installa a mano un profilo di attendibilità: troppo difficile per chi usa TIO.
- Le notifiche push delle web app su iPhone esistono dal 2023 (iOS 16.4) solo per le app aggiunte alla schermata Home e richiedono un server di notifiche raggiungibile da Internet: non adatte a TIO.
- **Conclusione:** utile solo come prova interna, non come prodotto.

### 3. App mobile con Capacitor (consigliata come prodotto)

Un'app vera che riusa React e gran parte dei componenti di TIO. Il collegamento al computer:

1. sul computer, *Impostazioni › Telefono › Collega un telefono* mostra un QR con indirizzo, porta, un codice monouso e l'**impronta del certificato** del computer;
2. l'app inquadra il QR e accetta solo quel certificato (*pinning*): HTTPS vero anche senza un'autorità di certificazione;
3. il computer registra il telefono in un elenco di dispositivi, con nome, ultimo accesso e **revoca** con un clic.

Dati sul telefono:

- una copia **parziale e cifrata** (Keychain su iPhone, Keystore su Android) di agenda, contatti e pratiche attive, per consultarla anche quando il computer non è raggiungibile, con la data dell'ultimo aggiornamento ben visibile;
- **promemoria locali** programmati dall'app sul telefono a partire dall'agenda copiata: avvisi veri senza server di notifiche;
- i documenti non vengono copiati: si scaricano solo quando si aprono.

Scritture:

- il computer resta **l'unico che scrive nell'archivio**; il telefono manda richieste («compito 123 completato», «nuova nota»), che il computer valida con le stesse regole di oggi (`electron/validation.js`) e applica;
- se il computer non è raggiungibile, le richieste restano in coda sul telefono e partono al collegamento successivo; un conflitto (lo stesso compito modificato sul computer) si risolve dando ragione al computer e avvisando.

Blocco con password: se TIO è bloccato sul computer, il telefono non riceve dati finché non viene sbloccato; l'app ha un suo sblocco con Face ID o impronta.

### 4. Raggiungere il computer da fuori

Fuori dalla rete dello studio il telefono non vede il computer. Le opzioni, in ordine di preferenza:

- **nessun accesso remoto** (predefinito): si consulta la copia sul telefono;
- **rete privata dell'utente** (Tailscale o WireGuard, già diffuse e gratuite per uso personale): TIO la documenta, non la gestisce;
- **inoltro di porte sul router**: sconsigliato, espone il computer a Internet;
- **un servizio di inoltro di TIO**: escluso, richiederebbe un server, costi e responsabilità.

## Distribuzione e costi

| | Android | iPhone |
| --- | --- | --- |
| Installazione | `.apk` firmato su GitHub (o F-Droid) | App Store o TestFlight |
| Costo | 0 € (Google Play: 25 $ una tantum, facoltativo) | **99 $ l'anno** |
| Revisione | nessuna fuori da Google Play | revisione Apple a ogni versione |
| Senza pagare | sì | solo installazione da Xcode, valida 7 giorni: non praticabile |

### Solo sui tuoi dispositivi, con Xcode e senza App Store

Sì, si può: TIO è già pensato per essere compilato dai sorgenti, e il Mac su cui gira TIO è lo stesso che serve per Xcode.

| | Apple ID gratuito («Personal Team») | Apple Developer Program (99 $ l'anno) |
| --- | --- | --- |
| Installazione | da Xcode, con l'iPhone collegato al Mac | da Xcode o con un file `.ipa` |
| Durata | **7 giorni**, poi l'app non si apre più finché non la reinstalli da Xcode | circa **1 anno** |
| Dispositivi | pochi dispositivi personali (indicativamente 3) | fino a 100 iPhone e 100 iPad |
| Funzioni | Face ID, Keychain, fotocamera per il QR, promemoria locali: sì; notifiche push e iCloud: no | tutte |
| App Store e revisione | no | no (se non la pubblichi) |

- **Con l'Apple ID gratuito** basta una volta a settimana: collegare l'iPhone al Mac e premere «Esegui» in Xcode (circa un minuto). Programmi come SideStore rinnovano la firma dal telefono, ma sono di terze parti e vanno valutati.
- **Con il programma a pagamento** l'app resta valida un anno ed è comoda anche per altre persone dello studio, sempre senza App Store.
- I limiti dell'account gratuito non sono documentati ufficialmente da Apple: possono cambiare.
- TIO Mobile non dipende dalle notifiche push (usa promemoria locali), quindi l'account gratuito non toglie nulla di essenziale.
- **Android:** il file `.apk` si installa sui tuoi dispositivi senza scadenza e senza costi.

**Conclusione:** per l'uso personale la strada Xcode + Apple ID gratuito è praticabile da subito; si passa ai 99 $ solo se il rinnovo settimanale diventa scomodo o se l'app serve ad altri.

## Rischi

- **Furto o perdita del telefono:** copia cifrata, sblocco biometrico, revoca dal computer, nessuna copia dei documenti.
- **Rete dello studio condivisa:** il server sul computer risponde solo ai telefoni collegati; è spento finché non si collega il primo telefono.
- **Aspettative:** chi lo usa deve capire che il telefono mostra l'ultima copia ricevuta: data dell'aggiornamento sempre in vista.
- **Manutenzione:** una terza piattaforma da provare a ogni versione (oggi Mac e Windows).

## Piano proposto

| Fase | Contenuto | Durata indicativa |
| --- | --- | --- |
| 0 | Agenda abbonabile dal calendario del telefono (strada 1) | 1 settimana |
| 1 | Server locale nel computer: collegamento con QR, elenco dispositivi, API in sola lettura | 2 settimane |
| 2 | App Capacitor: agenda, ricerca, scheda pratica, copia cifrata, promemoria locali | 3–4 settimane |
| 3 | Azioni rapide dal telefono (compiti, note, scadenze) con coda | 1–2 settimane |
| 4 | Pubblicazione: Android su GitHub; iPhone solo se si decide di pagare l'Apple Developer Program | — |

**Raccomandazione:** fare subito la fase 0, che dà la maggior parte del valore (agenda e avvisi sul telefono) senza costi e senza rischi, e decidere sull'App Store prima di iniziare la fase 2.
