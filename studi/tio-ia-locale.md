# TIO e intelligenza artificiale locale — studio di fattibilità

Novembre 2026, sulla base di TIO 1.0.4. Obiettivo: usare modelli di IA che girano **sul computer di chi usa TIO**, senza mandare dati a servizi esterni, e permettere agli assistenti di IA di consultare TIO in modo controllato.

## In breve

- **Fattibile e coerente con TIO**, in due direzioni che si completano:
  1. **TIO come fonte di dati per un assistente** (protocollo MCP): l'assistente che l'utente già usa può cercare pratiche, scadenze e documenti in TIO, in sola lettura e con il suo permesso.
  2. **TIO che usa un modello locale** (Ollama, LM Studio, llama.cpp) per riassunti, bozze, estrazione di dati dai documenti e una ricerca in linguaggio naturale, sempre con anteprima e conferma.
- **Non incorporare un modello linguistico dentro l'installer:** pesa da 2 a 8 GB. Meglio collegarsi a un programma che l'utente installa a parte, oppure scaricare il modello solo su richiesta.
- **Eccezione utile:** un piccolo modello per riconoscere i dati personali (sul tipo di Rizzo-PII, circa 0,3 miliardi di parametri) può stare in TIO come download facoltativo e migliorare Anonimizza.
- **Regola ferma:** termini processuali, compensi, IVA e scadenze fiscali restano calcolati con le regole di oggi, mai dal modello.

## Cosa esiste oggi (verificato a novembre 2026)

- **Ollama** e **LM Studio** espongono un'interfaccia compatibile con quella di OpenAI sul computer (`http://localhost:11434/v1` per Ollama, `http://localhost:1234/v1` per LM Studio), con le chiamate a funzione per i modelli che le supportano (Qwen 2.5 e successivi, Llama 3.1 e successivi, Mistral).
- **MCP** (Model Context Protocol) è il modo standard con cui un assistente usa strumenti esterni. Lo supportano Claude Desktop e diversi programmi per modelli locali; Ollama da solo non fa da client MCP e serve un programma intermedio.
- **Prestazioni indicative:** su un Mac con chip Apple e 16 GB di memoria un modello da 7–8 miliardi di parametri quantizzato a 4 bit scrive a una velocità comoda; su un PC Windows senza scheda grafica dedicata è lento (pochi token al secondo). Con 8 GB di memoria solo modelli piccoli, di qualità limitata in italiano giuridico.

## Direzione 1 — TIO come fonte per gli assistenti (server MCP)

TIO offre, se l'utente lo attiva, un server MCP locale con strumenti **in sola lettura**:

| Strumento | Cosa restituisce |
| --- | --- |
| `cerca` | risultati della ricerca globale (clienti, pratiche, scadenze, note, testo dei documenti) |
| `pratica` | scheda della pratica: persone, stato, scadenze, compiti, note |
| `agenda` | impegni tra due date |
| `documento_testo` | testo già indicizzato di un documento (PDF e scansioni con OCR compresi) |
| `da_incassare` | documenti aperti e scaduti |

Scelte di progetto:

- **Spento per impostazione predefinita**; si attiva in *Impostazioni › IA*, con l'elenco di cosa può leggere.
- Il server MCP **non apre l'archivio da solo**: chiede i dati all'app in esecuzione su un canale locale con un codice, così valgono blocco con password, permessi e registro.
- **Anonimizzazione per gli assistenti in cloud:** un'opzione restituisce i testi con i segnaposto di Anonimizza (`[NOME_COMPLETO_1]`…) e conserva la chiave in TIO; la risposta dell'assistente si rimette in chiaro con «Ripristina», che esiste già. È il punto di forza rispetto a strumenti generici.
- **Registro**: ogni richiesta dell'assistente viene annotata (quando, quale strumento, quale pratica), consultabile dall'utente.
- Le scritture (creare un compito, una nota) arrivano in un secondo momento, sempre con conferma nell'app.

## Direzione 2 — TIO che usa un modello locale

*Impostazioni › IA › Modello locale*: indirizzo (Ollama o LM Studio riconosciuti da soli), modello, prova di collegamento. Funzioni proposte, tutte con anteprima e nulla salvato senza conferma:

| Funzione | Dove | Valore | Rischio |
| --- | --- | --- | --- |
| Riassunto di un documento o di una pratica | scheda della pratica | alto | basso: si legge e si scarta |
| Bozza di lettera da un modello e da poche istruzioni | Documenti | alto | medio: va riletta |
| Estrazione di dati da un PDF (parti, importi, date, RG) proposti come scadenze o anagrafiche | documenti della pratica | alto | medio: confronto campo per campo |
| Proposta di sottocartella o categoria per i file nuovi | Sincronizza | medio | basso |
| Ricerca in linguaggio naturale («udienze di dicembre di Rossi») tradotta in filtri | ricerca | medio | basso: si vedono i filtri |
| Riconoscimento dei nomi in Anonimizza | Anonimizza | alto | basso: si somma alle regole e si misura sul campione |

Il modello non decide mai da solo: propone, l'utente conferma. Le date e gli importi estratti si controllano con le regole già presenti (date valide, codice fiscale, IVA).

## Direzione 3 — Modello piccolo dentro TIO (solo per Anonimizza)

- Un modello per il riconoscimento delle entità come Rizzo-PII (0,3 miliardi di parametri) convertito in ONNX e quantizzato pesa qualche centinaio di MB e gira in un processo separato con `transformers.js` o `onnxruntime-node`.
- **Download facoltativo** da *Impostazioni › Anonimizza*, con codice di controllo, non incluso nell'installer.
- Si combina con le regole attuali: un dato riconosciuto da entrambi è più sicuro; uno solo dal modello si mostra come «da controllare».
- **Prova prima di adottarlo:** il campione annotato di `scripts/fixtures/campione-anonimizza` misura richiamo e precisione; il modello entra solo se migliora il richiamo senza abbassare la precisione. Verificare la licenza dei pesi del modello prima di distribuirli.

## Una pagina «Assistente» con chat e agente, anche con FreeLLM

### Cos'è FreeLLM

FreeLLM (e il progetto simile FreeLLMAPI) è un **proxy** da installare sul computer che riunisce i livelli gratuiti di molti servizi in cloud (Groq, Gemini, Mistral, Cerebras, NVIDIA, Cloudflare, GitHub Models…) dietro un unico indirizzo compatibile con OpenAI, passando da uno all'altro quando si esaurisce un limite. Può includere anche Ollama.

### Si può fare

Tecnicamente è semplice: per TIO FreeLLM è un altro indirizzo compatibile con OpenAI, come Ollama o LM Studio. Una sola impostazione *Provider IA* basta per tutti:

- **Locale** (Ollama, LM Studio): i dati restano sul computer. Consigliato.
- **Cloud tramite proxy** (FreeLLM) o **cloud a pagamento**: più veloce e capace, ma i dati escono.

### Perché con FreeLLM serve cautela

- **I dati escono dal computer verso servizi diversi**, scelti dal proxy di volta in volta: non sai a priori chi riceve il testo di una pratica.
- **I livelli gratuiti** spesso permettono al fornitore di conservare o usare i dati per migliorare i modelli: per atti, dati sanitari o dati di clienti è un problema di segreto professionale e di GDPR.
- **Affidabilità:** limiti di uso, cambi di modello a metà conversazione, servizi che spariscono; unire molte chiavi gratuite può violare le condizioni d'uso dei fornitori.
- **Un servizio in più** da tenere acceso e aggiornato.

**Regola proposta:** con un provider che non è sul computer, TIO **anonimizza sempre** prima di inviare (segnaposto di Anonimizza) e rimette in chiaro la risposta; l'utente vede l'avviso «i dati escono dal computer» e può escludere pratiche intere. Con un provider locale l'anonimizzazione è facoltativa.

### Come sarebbe la pagina

- **Assistente** nella barra laterale: chat con il contesto scelto (nessuno, una pratica, un documento), risposte con i riferimenti cliccabili a pratiche e documenti.
- **Agente:** lo stesso insieme di strumenti del server MCP (cerca, pratica, agenda, testo dei documenti, da incassare), più strumenti che **propongono** modifiche (nuovo compito, nuova scadenza, bozza di lettera). Le proposte finiscono in un pannello da approvare una per una: l'agente non scrive mai da solo.
- **Limiti di sicurezza:** numero massimo di passi per richiesta, nessun accesso a file fuori dall'archivio, a comandi di sistema o a Internet, registro di ogni strumento usato, pulsante per fermarlo.
- **Agenti salvati:** istruzioni riutilizzabili («Ogni lunedì riassumi le scadenze della settimana», «Controlla i documenti nuovi e proponi le scadenze»), sempre con lo stesso pannello di approvazione.

### Ordine consigliato

1. Strumenti di TIO in un unico livello (servono sia al server MCP sia all'agente interno).
2. Provider IA (locale per primo) e pagina Assistente in sola lettura.
3. Agente con proposte da approvare.
4. Provider in cloud, FreeLLM compreso, solo con l'anonimizzazione obbligatoria attiva.

## Aspetti legali e professionali

- **Legge 132/2025, art. 13:** chi usa l'IA nell'attività professionale deve informarne il cliente. TIO ha già il modello «Informativa uso dell'intelligenza artificiale»; con l'IA attiva TIO lo ricorda.
- **GDPR:** con un modello locale i dati non escono dal computer; con un assistente in cloud vale l'anonimizzazione proposta sopra. La sostituzione con segnaposto è una **pseudonimizzazione**: i dati restano personali finché esiste la chiave.
- **Responsabilità:** ogni testo prodotto dal modello è una bozza; TIO lo dice in modo chiaro e non lo invia mai da solo.

## Piano proposto

| Fase | Contenuto | Durata indicativa |
| --- | --- | --- |
| 1 | Server MCP in sola lettura, canale locale con l'app, registro, anonimizzazione facoltativa | 2–3 settimane |
| 2 | Collegamento a un modello locale; riassunto, bozza di lettera, estrazione dati da PDF | 3–4 settimane |
| 3 | Modello di riconoscimento per Anonimizza, scaricabile, misurato sul campione | 2 settimane |
| 4 | Ricerca in linguaggio naturale e proposta di cartelle | 1–2 settimane |
| 5 | Pagina Assistente con chat e agente (proposte da approvare); provider in cloud solo con anonimizzazione | 3–4 settimane |

**Raccomandazione:** partire dalla fase 1. Costa poco, non aggiunge peso all'installer, funziona con gli assistenti che le persone già usano, e l'anonimizzazione integrata la rende diversa da un semplice accesso ai dati.
