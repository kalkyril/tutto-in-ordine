# Origine dei parametri

Dal rilascio 1.3.0 le tabelle sono ricostruite dagli allegati ministeriali della Gazzetta Ufficiale, senza usare i dati scaricati dal calcolatore privato delle versioni precedenti.

- [DM 55/2014, pubblicazione originale](https://www.gazzettaufficiale.it/eli/id/2014/04/02/14G00067/sg): allegato Tabelle Parametri Forensi, incluso il prospetto penale nel PDF della serie generale 77 del 2 aprile 2014.
- [DM 147/2022](https://www.gazzettaufficiale.it/eli/id/2022/10/08/22G00157/sg): allegato Nuove tabelle parametri forensi, tabella penale anche nel PDF della serie generale 236 dell’8 ottobre 2022.

Data della ricostruzione: 14 ottobre 2026. `fonti` nel JSON conserva URL e SHA-256 dei due allegati HTML acquisiti. Gli identificatori numerici già usati da TIO sono mantenuti per leggere i documenti salvati; non indicano un collegamento al servizio esterno.

Il generatore `scripts/genera-tabelle-normative.py --dm2014 allegato-2014.html --dm2022 allegato-2022.html` accetta copie locali degli allegati HTML originali (nessuna rete). La matrice penale, parzialmente grafica negli HTML, è trascritta dai PDF. Gli scaglioni successivi a 520.000 euro sono elaborazioni con incremento del 30%; minimi e massimi sono arrotondati all’euro. Per il civile 2014 si applica l’intervallo specifico della fase istruttoria. Per l’appello cautelare al Consiglio di Stato si considerano studio, introduttiva e metà decisionale (art. 4, comma 10-ter).

Gli indeterminabili (art. 5, comma 6: di regola tra 26.000 e 260.000 €, fino a 520.000 se di particolare importanza) seguono i calcolatori di avvocatoandreani.it: complessità bassa = scaglione 26.001–52.000, media = valore medio fra 26.001–52.000 e 52.001–260.000, alta = 52.001–260.000, particolare importanza = 260.001–520.000. La scelta del livello di complessità resta del professionista. Per lo stragiudiziale 2022, «complessità alta» sul sito mostra 5.436 € di medio invece dei 4.536 € dello scaglione 52.001–260.000 (cifre apparentemente invertite): TIO usa lo scaglione. Gli affari oltre 32 milioni richiedono importo manuale; per lo stragiudiziale 2022 resta la formula locale dedicata oltre 520.000. Le tabelle 2014 sono quelle originarie: non coprono automaticamente tutte le modifiche del 2018. L’etichetta indica l’edizione del parametro, non una verifica di tutte le norme vigenti nel 2026.

La trascrizione e gli algoritmi devono essere ricontrollati a ogni modifica normativa. Il calcolo non certifica il compenso dovuto, le condizioni delle variazioni o il regime fiscale. Il professionista deve verificare il testo applicabile alla data della prestazione e al caso concreto. I documenti già salvati conservano i loro importi; non vengono ricalcolati retroattivamente.
