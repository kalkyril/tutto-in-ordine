export interface Anagrafica {
  id: number; tipo: 'persona' | 'azienda'; ruolo: 'cliente' | 'controparte' | 'fornitore' | 'collaboratore' | 'altro'; denominazione: string
  codice_fiscale?: string; partita_iva?: string; email?: string; pec?: string; telefono?: string
  indirizzo?: string; cap?: string; citta?: string; provincia?: string; note?: string; created_at: string
  /** 1.0.2: titolo della persona fisica (Avv., Ing., Dott.…), codice destinatario SDI, recapiti con etichetta (JSON di Recapiti) */
  titolo?: string | null; sdi?: string | null; recapiti?: string | null
  /** 1.0.3: altri indirizzi oltre al principale (JSON di Indirizzo[]) */
  indirizzi?: string | null
}
/** Un indirizzo in più del contatto, con la sua etichetta («Sede operativa», «Domicilio», «Cantiere»…). */
export interface Indirizzo { etichetta: string; indirizzo: string; cap: string; citta: string; provincia: string }
export type RuoloPersona = 'cliente' | 'controparte' | 'fornitore' | 'collaboratore' | 'altro'
/** Una persona in più della pratica, oltre a cliente e controparte principali. */
export interface PersonaPratica { id: number; ruolo: RuoloPersona }
/** Un telefono o un'email con la sua etichetta: «Cellulare», «Fisso» o un nome scelto dall'utente («Ufficio», «Amministrazione»). */
export interface Recapito { etichetta: string; valore: string }
export interface Recapiti { telefoni: Recapito[]; email: Recapito[] }
export interface Pratica {
  id: number; numero: string; titolo: string; cliente_id: number | null; controparte_id: number | null
  tipo?: string; stato?: string; colore: string; autorita?: string; giudice?: string; rg?: string
  valore?: number | null; data_apertura?: string; data_chiusura?: string; descrizione?: string; cartella?: string | null; cartella_cliens?: string | null; preferita: number; created_at: string
  budget_ore?: number | null; budget_importo?: number | null; consegna?: string | null
  /** 1.0.3: altre persone (JSON di PersonaPratica[]) e ruolo ricoperto nella pratica da chi usa TIO («Difensore», «CTU», «Direttore dei lavori»…) */
  persone?: string | null; ruolo?: string | null
}
export type TipoScadenza = 'scadenza' | 'udienza' | 'appuntamento' | 'altro'
export interface Scadenza {
  id: number; pratica_id: number | null; titolo: string; tipo: TipoScadenza; data_ora: string
  tutto_il_giorno: number; luogo?: string; note?: string; promemoria: string; completata: number
}
export interface Todo {
  id: number; pratica_id: number | null; titolo: string; note?: string; scadenza?: string | null
  priorita: number; promemoria_min: number | null; completata: number; completata_il?: string | null; ordine: number
}
export interface Cronologia { id: number; pratica_id: number; tabella: string; rec_id: number | null; azione: 'creato' | 'completato' | 'riaperto' | 'eliminato' | 'stato'; testo: string; created_at: string }
export interface Nota { id: number; pratica_id: number; testo: string; created_at: string; updated_at: string }
export interface Documento { id: number; pratica_id: number; nome: string; file: string; dimensione: number; categoria?: string; ora_id?: number | null; percorso?: string | null; impronta?: string | null; rel?: string | null; percorso_cliens?: string | null; origine?: 'cliens' | 'locale' | 'condivisa' | null; created_at: string }
export interface Link { id: number; pratica_id: number | null; titolo: string; url: string; categoria?: string; descrizione?: string; colore?: string; ordine: number }
export interface Ora { id: number; pratica_id: number; data: string; minuti: number; descrizione: string; dettagli?: string | null; tariffa_oraria: number; parcella_id: number | null
  /** 1.0.2: tariffa ancora da decidere (si inserisce dopo, anche nel documento di vendita) */
  tariffa_da_decidere?: number }
export interface Spesa { id: number; pratica_id: number; data: string; descrizione: string; importo: number; esente: number; parcella_id: number | null }
export interface VoceParcella { id?: number; tipo: 'compenso' | 'spesa_esente' | 'spesa_imponibile'; descrizione: string; quantita: number; importo: number }
export interface Parcella {
  id: number; anno: number; progressivo: number; numero: string; pratica_id: number | null; cliente_id: number | null
  tipo: 'preventivo' | 'parcella' | 'proforma' | 'nota_credito'; data: string; oggetto?: string; stato: 'bozza' | 'emessa' | 'pagata' | 'annullata' | 'stornata'
  incassato?: number; scadenza_pagamento?: string | null; data_pagamento?: string | null; sg_perc: number; cpa_perc: number; iva_perc: number; rit_perc: number; bollo: number
  compensi: number; spese_generali: number; cpa: number; imponibile: number; iva: number; spese_esenti: number
  ritenuta: number; totale: number; netto: number; note?: string; calcolo?: string | null; importazione?: string | null; voci?: VoceParcella[]
  validita?: string | null; esito_preventivo?: 'da_inviare' | 'inviato' | 'accettato' | 'rifiutato'; origine_preventivo_id?: number | null
  contributo_nome?: string | null; contributo_ritenuta?: number; incassi_dettagliati?: number
  /** nota di credito: id della fattura stornata */
  storno_di?: number | null
}
/** Calendario esterno collegato in sola lettura (Cliens Più, Google Calendar, Outlook…). */
export interface Calendario {
  id: number; nome: string; url: string; colore: string; attivo: number; intervallo_min: number; promemoria: string
  ultimo_sync?: string | null; ultimo_tentativo?: string | null; ultimo_esito?: 'ok' | 'errore' | null; ultimo_errore?: string | null; n_eventi: number; crea_pratiche?: number
}
export interface EventoEsterno {
  id: number; calendario_id: number; chiave: string; titolo: string; descrizione?: string; luogo?: string
  inizio: string; fine?: string; tutto_il_giorno: number; pratica_id: number | null
}
export interface Notifica { id: number; titolo: string; corpo?: string; tipo: string; rif_tipo?: string | null; rif_id?: number | null; pratica_id?: number | null; letta: number; created_at: string }
export interface StatoPratica { nome: string; chiusa: boolean; colore: string }
export interface Settings {
  profilo: 'avvocato' | 'ditta'
  attivita?: 'studio' | 'professionista' | 'impresa'; contributo_nome?: string; contributo_ritenuta?: boolean
  studio: { nome: string; indirizzo: string; cap_citta: string; piva: string; cf: string; email: string; pec: string; telefono: string; iban: string; intestazione: string; domicilio_fiscale: string; banca: string; titolare: string }
  tipi_pratica: string[]; stati_pratica: StatoPratica[]
  promemoria_default: number[]; ora_default_giornata: number
  aliquote: { sg: number; cpa: number; iva: number; rit: number; bollo: number }
  tariffa_oraria: number; tema: 'auto' | 'chiaro' | 'scuro'
  resta_in_background: boolean; avvia_al_login: boolean; notifiche_desktop: boolean; avvisa_ritardi: boolean; riepilogo_giornaliero: boolean
  tariffe_online: boolean
  modello_pdf?: ModelloPdf
  modelli_documento?: ModelloDocumento[]
  brand_colore: string; brand_logo: string | null; onboarding_fatto: boolean
  backup_cifrato: boolean; backup_automatico: boolean; backup_cartella: string; backup_mantieni: number; backup_ultimo?: string; backup_documenti: boolean; backup_esito?: 'ok' | 'errore'; backup_errore?: string; backup_tentativo?: string; vista_compatta: boolean; notifiche_riservate: boolean
  // controllo facoltativo degli aggiornamenti: l'utente decide se attivarlo, il resto lo scrive il processo principale
  aggiornamenti_controllo: boolean; aggiornamenti_ultimo?: string; aggiornamenti_errore?: string | null; aggiornamento?: { versione: string; pagina: string } | null; aggiornamento_notificato?: string; aggiornamenti_chiesto?: boolean
  cartella_cliens?: string // cartella principale dei documenti scaricati da Cliens (una sottocartella per pratica)
  cartella_documenti: string; cartelle_ricerca: string[] // dove salvare i documenti creati dall'app; dove cercare i file spostati
  etichette: Labels; categorie_link: string[]; palette: string[]
  /** 1.0.2: colori di incassate, da incassare, pagate e da pagare (scadenzario e grafico della pratica) */
  colori_pagamenti?: Partial<Record<'incassate' | 'da_incassare' | 'pagate' | 'da_pagare', string>>
  [k: string]: any
}
/** Riga di testo dell'intestazione o del piè di pagina dei documenti PDF. */
export interface RigaModello { testo: string; dimensione: 'grandissima' | 'grande' | 'media' | 'normale' | 'piccola'; grassetto: boolean; corsivo: boolean; sottolineato?: boolean; allineamento: 'sinistra' | 'centro' | 'destra'; font?: string }
export type TipoTitolo = 'proforma' | 'parcella' | 'preventivo' | 'nota_credito'
export interface StileTitolo { testo: string; dimensione: number; grassetto: boolean; corsivo: boolean; allineamento: 'sinistra' | 'centro' | 'destra'; font?: string }
export interface FontDocumento { id: string; nome: string; formato: 'ttf' | 'otf' | 'woff' | 'woff2'; dati: string }
export interface ModelloPdf {
  intestazione: RigaModello[]; pagamento: RigaModello[]; footer: RigaModello[]
  logo: string | null; logoAltezza: number; logoAllineamento: 'sinistra' | 'centro' | 'destra'
  immagineFooter?: string | null; immagineFooterAltezza?: number; immagineFooterAllineamento?: 'sinistra' | 'centro' | 'destra'
  fontDocumento?: string; fontPersonali?: FontDocumento[]
  /** font installati sul computer, per nome (es. «Palace Script MT»): nei PDF e nei file Word si usano se presenti sul computer che li apre */
  fontSistema?: string[]
  /** titolo di ogni tipo di documento di vendita: testo, dimensione (pt), stile, allineamento e font */
  titoli?: Partial<Record<TipoTitolo, StileTitolo>>
  mostraLuogoData: boolean; luogo: string
  /** 1.0.2: dove mettere luogo e data (predefinito in alto a destra) */
  posizioneLuogoData?: PosizioneLuogoData
}
export type PosizioneLuogoData = 'alto-destra' | 'alto-sinistra' | 'basso-sinistra' | 'basso-destra'
/** Modello della sezione Documenti: stessa intestazione e piè di pagina della nota pro forma, più il corpo (HTML pulito). */
export interface ModelloDocumento extends ModelloPdf {
  id: string; nome: string; tipo: string; corpo: string; numeriPagina: boolean; aggiornato: string; allineamento?: Allineamento; colonne?: 1 | 2; predefinito?: boolean; word?: boolean; campiWord?: string[]
  /** impaginazione: margini della pagina in mm (in alto, in basso, ai lati) e dimensione del testo del corpo in punti */
  margini?: MarginiPagina; corpoPt?: number
  /** 1.0.2: foto della firma (al posto di {{firma}} nel testo), con altezza in pixel e allineamento */
  firma?: string | null; firmaAltezza?: number; firmaAllineamento?: Allineamento
  /** 1.0.2: campi inventati dall'utente per questo modello (es. «n.giorni», «compenso»), da compilare alla creazione */
  campiPersonali?: string[]
}
export interface MarginiPagina { sopra: number; sotto: number; lati: number }
export type Allineamento = 'sinistra' | 'centro' | 'destra' | 'giustificato'
export interface Labels {
  pratica: string; pratiche: string; cliente: string; clienti: string; controparte: string
  autorita: string; rg: string; giudice: string; parcella: string; parcelle: string
}
export interface SearchHit { kind: string; id: number; pratica_id?: number; title: string; sub?: string; color?: string }
