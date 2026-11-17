# Pagamenti e budgeting — studio critico e proposte

Novembre 2026, sulla base di TIO 1.0.4. Domanda: la sezione Pagamenti va potenziata? **Sì**: oggi registra bene il denaro che entra ed esce, ma **non aiuta a prevedere né a pianificare**. Le proposte valgono per tutti i profili (studio legale, libero professionista, ditta); cambia solo il calcolo dei documenti per gli avvocati, che resta com'è.

## Cosa c'è oggi

- **Scadenzario** mese per mese: incassate, da incassare, pagate, da pagare; panoramica dell'anno in dodici colonne con la differenza di ogni mese.
- **Incassi:** documenti di vendita, registro dei pagamenti con il metodo, solleciti già scritti, prima nota CSV per il commercialista, XML FatturaPA.
- **Da pagare:** voci con categoria, fornitore, scadenza, contabile allegata.
- **Per pratica:** valore con il grafico (incassato, da incassare, pagato, da pagare), redditività (ore, spese, fatturato), budget di ore e importo con la data di consegna.
- **Scadenze fiscali** (IVA, F24, imposte, contributi) come promemoria ricorrenti.

## Critica

1. **Non sai quanto hai davvero.** La «differenza» del mese non è la liquidità: manca un saldo di partenza per conto (banca, carta, contanti). Il metodo di pagamento c'è già ma non viene usato per i saldi.
2. **Le spese fisse non si ripetono.** Affitto, utenze, software, assicurazioni, leasing vanno inseriti a mano ogni volta. Le «ricorrenze» creano compiti, non uscite: lo scadenzario dei mesi futuri sottostima le uscite e il saldo previsto è troppo ottimista.
3. **Le tasse non sono messe da parte.** Il saldo previsto mescola soldi che non sono tuoi: IVA incassata da versare, ritenute, imposta sostitutiva, contributi, acconti di giugno e novembre. È l'errore più costoso per un forfettario o una ditta.
4. **Il futuro si ferma alle fatture emesse.** Preventivi inviati o accettati, compensi per ore già lavorate e non fatturate, rate concordate non entrano nella previsione.
5. **Nessun budget, nessun confronto.** Non si può dire «quest'anno per il software spendo al massimo 1.200 €» e vedere come si sta andando; il budget della pratica esiste ma resta in un riquadro, senza avvisi.
6. **Il forfettario non è sorvegliato.** La soglia dei ricavi (85.000 €; oltre 100.000 € si esce subito dal regime) non viene seguita durante l'anno.
7. **Incassi a rate** solo come pagamenti parziali, senza un piano con le date.
8. **Riconciliazione manuale:** confrontare l'estratto conto con i movimenti di TIO si fa a occhio.
9. **Pochi indicatori:** mancano i giorni medi d'incasso per cliente, i clienti che pagano in ritardo, il margine per cliente o per tipo di lavoro.

## Proposte, in ordine di valore

| # | Proposta | Cosa risolve | Impegno |
| --- | --- | --- | --- |
| 1 | **Uscite ricorrenti**: una voce «da pagare» che si ripete (mensile, trimestrale, annuale) con importo fisso o stimato | 2 | piccolo |
| 2 | **Conti e saldo reale**: conti con saldo iniziale; ogni incasso e pagamento su un conto (dal metodo); saldo di oggi e andamento | 1 | medio |
| 3 | **Accantonamento fiscale**: stima di imposte, contributi e IVA per regime (forfettario con coefficiente e aliquota 5% o 15%; ordinario con IVA a debito; contributi della propria cassa); «disponibile davvero» = saldo − accantonamento | 3 | medio |
| 4 | **Previsione di cassa a 3, 6 e 12 mesi**: incassi attesi alla data probabile (con il ritardo medio del cliente), preventivi pesati per probabilità, uscite ricorrenti, scadenze fiscali stimate; vista prudente e ottimista; avviso se un mese va sotto zero | 4 | medio |
| 5 | **Budget annuale per categoria** di spesa, con previsto, speso e avviso all'80% e al 100%; budget della pratica con barra di avanzamento e avviso | 5 | medio |
| 6 | **Soglia del forfettario e obiettivo di fatturato**: barra dell'anno, avviso vicino alla soglia | 6 | piccolo |
| 7 | **Piani di pagamento**: un documento diviso in rate con le date, solleciti per rata | 7 | medio |
| 8 | **Indicatori**: giorni medi d'incasso, clienti in ritardo, margine per cliente e per tipo di lavoro, ore non ancora fatturate | 9 | piccolo |
| 9 | **Import dell'estratto conto** (CSV o Excel della banca) con abbinamento automatico a incassi e pagamenti per importo e data | 8 | grande |

## Come si presenterebbe

- **Scadenzario** con una riga in più: «disponibile davvero» accanto al saldo, e i mesi futuri che comprendono uscite ricorrenti e tasse stimate.
- **Nuova scheda «Previsione»** in Pagamenti: grafico a 12 mesi del saldo previsto (prudente e ottimista), elenco dei mesi a rischio, da dove arrivano entrate e uscite.
- **Nuova scheda «Budget»**: categorie con previsto e speso, soglia del forfettario, obiettivo dell'anno.
- **Panoramica**: un riquadro con saldo di oggi, disponibile dopo le tasse e il prossimo mese a rischio.

## Cosa non fare

- **Contabilità in partita doppia e bilancio:** è il lavoro del commercialista; TIO prepara i file per lui.
- **Collegamento diretto alla banca** (servizi PSD2): richiede intermediari autorizzati, contratti e dati fuori dal computer.
- **Invio allo SdI:** resta al canale dell'utente, come oggi.

## Avvertenza

Le stime fiscali sono un aiuto per mettere da parte il denaro, non un calcolo da dichiarazione: aliquote, coefficienti e contributi dipendono dalla situazione di ciascuno e cambiano con le leggi. Vanno impostati con il proprio commercialista e mostrati sempre come «stima».

## Stato

Nella 1.0.4 è fatta gran parte delle proposte, in una sezione **Budget** separata da Pagamenti (Pagamenti registra il denaro, Budget guarda avanti):

- uscite ricorrenti (1), conti e saldo reale con movimenti e giroconti (2);
- accantonamento fiscale a percentuale o con una stima per regime, forfettario e ordinario (3);
- previsione di cassa a dodici mesi con scenario prudente (4) e budget annuo per categoria (prima parte del punto 5);
- soglia del forfettario con l'obiettivo di incasso (6);
- in più: lettura in sola lettura delle fatture elettroniche esportate dal servizio di fatturazione e pacchetto per il commercialista (riepilogo PDF, CSV, contabili).

Fatti anche il budget della pratica con avvisi (seconda parte del 5), i piani di pagamento come rate attese (7) e gli indicatori (8). Resta l'import dell'estratto conto con l'abbinamento automatico (9), previsto per la 1.0.5: con i conti ora ha dove appoggiarsi.

## Piano proposto per la prossima versione

1. Uscite ricorrenti (1) e soglia del forfettario (6): piccoli, utili subito.
2. Conti e saldo reale (2), poi accantonamento fiscale (3).
3. Previsione di cassa (4) e budget per categoria (5).
4. Piani di pagamento (7), indicatori (8), import dell'estratto conto (9).

Le voci 1, 2, 3 e 6 da sole cambiano la domanda a cui TIO risponde: da «quanto ho incassato» a «quanto posso spendere senza sorprese».
