# Campione annotato per misurare Anonimizza

Documenti di esempio con **dati inventati** (nomi, codici e indirizzi non appartengono a persone reali).
Ogni dato da anonimizzare è segnato così: `{{TIPO|testo}}`, dove TIPO è uno dei tipi di `src/lib/anonimizza.ts`
(FULLNAME, ORG, CF, PIVA, IBAN, EMAIL, TELEPHONENUM, STREET, ZIPCODE, CITY, DATE, AMOUNT, DOCID, TARGA…).

`node scripts/misura-anonimizza.mjs` misura su questi file:
- **richiamo**: quanti dati segnati vengono trovati (un dato sfuggito resta in chiaro: è l'errore grave);
- **precisione**: quanti dati trovati erano davvero da nascondere (un eccesso nasconde parole innocue: errore lieve).

Per misurare su documenti propri, annotarli allo stesso modo in una cartella **fuori dal progetto**
e passarla come argomento: `node scripts/misura-anonimizza.mjs /percorso/cartella`. Lo script stampa solo i numeri,
mai il contenuto dei documenti.
