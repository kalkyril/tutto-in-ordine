import type { Labels, Settings } from '../types'

export const NOME_APP = 'TIO'
export const COLORE_BRAND_PREDEFINITO = '#4338ca'

export const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#64748b',
]

export const LABELS_AVVOCATO: Labels = {
  pratica: 'Pratica', pratiche: 'Pratiche', cliente: 'Cliente', clienti: 'Clienti', controparte: 'Controparte',
  autorita: 'Autorità giudiziaria', rg: 'N. RG', giudice: 'Giudice / Sezione', parcella: 'Parcella', parcelle: 'Parcelle',
}
export const LABELS_DITTA: Labels = {
  pratica: 'Pratica', pratiche: 'Pratiche', cliente: 'Cliente', clienti: 'Clienti', controparte: 'Fornitore / Altro',
  autorita: 'Ente / Ufficio', rg: 'Riferimento', giudice: 'Referente', parcella: 'Fattura', parcelle: 'Fatture',
}

export const TIPI_AVVOCATO = ['Civile', 'Penale', 'Lavoro', 'Amministrativo', 'Tributario', 'Famiglia', 'Stragiudiziale', 'Consulenza', 'Recupero crediti', 'Altro']
export const TIPI_DITTA = ['Commessa', 'Preventivo', 'Fornitura', 'Consulenza', 'Manutenzione', 'Pratica amministrativa', 'Altro']

export const DEFAULT_STATI = [
  { nome: 'Aperta', chiusa: false, colore: '#3b82f6' },
  { nome: 'In corso', chiusa: false, colore: '#8b5cf6' },
  { nome: 'In attesa', chiusa: false, colore: '#f59e0b' },
  { nome: 'Sospesa', chiusa: false, colore: '#64748b' },
  { nome: 'Chiusa', chiusa: true, colore: '#22c55e' },
  { nome: 'Archiviata', chiusa: true, colore: '#94a3b8' },
]


export const PROMEMORIA_OPZIONI: { v: number; l: string }[] = [
  { v: 0, l: 'Al momento dell\'evento' },
  { v: 15, l: '15 minuti prima' },
  { v: 30, l: '30 minuti prima' },
  { v: 60, l: '1 ora prima' },
  { v: 120, l: '2 ore prima' },
  { v: 1440, l: '1 giorno prima' },
  { v: 2880, l: '2 giorni prima' },
  { v: 4320, l: '3 giorni prima' },
  { v: 10080, l: '1 settimana prima' },
  { v: 20160, l: '2 settimane prima' },
]

export const DEFAULT_SETTINGS: Settings = {
  profilo: 'avvocato',
  studio: { nome: '', intestazione: '', indirizzo: '', cap_citta: '', piva: '', cf: '', email: '', pec: '', telefono: '', iban: '', domicilio_fiscale: '', banca: '', titolare: '' },
  tipi_pratica: TIPI_AVVOCATO,
  stati_pratica: DEFAULT_STATI,
  promemoria_default: [1440, 60],
  ora_default_giornata: 9,
  aliquote: { sg: 15, cpa: 4, iva: 22, rit: 20, bollo: 2 },
  tariffa_oraria: 150, tariffe_online: false,
  brand_colore: '#4338ca', brand_logo: null, onboarding_fatto: false,
  tema: 'auto',
  resta_in_background: true, avvia_al_login: false, notifiche_desktop: true, avvisa_ritardi: true, riepilogo_giornaliero: true,
  notifiche_riservate: true, vista_compatta: false, backup_documenti: true, backup_cifrato: false, backup_automatico: true, backup_cartella: '', backup_mantieni: 7, aggiornamenti_controllo: false,
  cartella_documenti: '', cartelle_ricerca: [],
  etichette: LABELS_AVVOCATO,
  categorie_link: ['Processo telematico', 'Normativa', 'Giurisprudenza', 'Fisco', 'Previdenza', 'Altro'],
  palette: PALETTE,
}

export const PRESET_DITTA: Partial<Settings> = {
  profilo: 'ditta', etichette: LABELS_DITTA, tipi_pratica: TIPI_DITTA,
  aliquote: { sg: 0, cpa: 0, iva: 22, rit: 0, bollo: 2 },
  categorie_link: ['Fisco', 'Fornitori', 'Banca', 'Camera di Commercio', 'Altro'],
}
export const PRESET_AVVOCATO: Partial<Settings> = {
  profilo: 'avvocato', attivita: 'studio', etichette: LABELS_AVVOCATO, tipi_pratica: TIPI_AVVOCATO,
  aliquote: { sg: 15, cpa: 4, iva: 22, rit: 20, bollo: 2 },
  categorie_link: ['Processo telematico', 'Normativa', 'Giurisprudenza', 'Fisco', 'Previdenza', 'Altro'],
}
export const PRESET_PROFESSIONISTA: Partial<Settings> = {
  ...PRESET_DITTA, tipi_pratica: ['Incarico', 'Consulenza', 'Progetto', 'Formazione', 'Assistenza', 'Pratica amministrativa', 'Altro'], attivita: 'professionista', contributo_nome: 'Contributo previdenziale', contributo_ritenuta: false,
  etichette: { ...LABELS_DITTA, pratica: 'Incarico', pratiche: 'Incarichi', controparte: 'Fornitore / Altro', parcella: 'Documento', parcelle: 'Documenti e incassi' },
}
export const PRESET_IMPRESA: Partial<Settings> = {
  ...PRESET_DITTA, attivita: 'impresa', contributo_nome: 'Contributo', contributo_ritenuta: false,
  etichette: { ...LABELS_DITTA, pratica: 'Commessa', pratiche: 'Commesse', parcella: 'Documento', parcelle: 'Documenti e incassi' },
}

/** Come si chiamano gli impegni nei titoli: le udienze esistono solo per lo studio legale. */
/** Tipi di scadenza con le parole del profilo: alle ditte e ai professionisti niente udienze. */
export const tipiScadenza = (profilo?: string): Record<string, { label: string; icon: string }> => profilo === 'ditta'
  ? { scadenza: { label: 'Scadenza', icon: 'alarm' }, appuntamento: { label: 'Appuntamento / sopralluogo', icon: 'users' }, altro: { label: 'Altro', icon: 'calendar' } }
  : TIPI_SCADENZA
/** «Nuovo incarico», «Nuova commessa», «Nuova pratica»: l'aggettivo segue il nome scelto per il lavoro. */
export const nuovo = (nome: string) => `${/[oe]$/i.test(nome.trim()) && !/zione$|ione$/i.test(nome.trim()) ? 'Nuovo' : 'Nuova'} ${nome.trim().toLowerCase()}`
export const nomeImpegni = (profilo?: string) => (profilo === 'ditta' ? 'Scadenze e appuntamenti' : 'Scadenze, udienze e appuntamenti')

export const TIPI_SCADENZA: Record<string, { label: string; icon: string }> = {
  scadenza: { label: 'Scadenza / termine', icon: 'alarm' },
  udienza: { label: 'Udienza', icon: 'gavel' },
  appuntamento: { label: 'Appuntamento', icon: 'users' },
  altro: { label: 'Altro', icon: 'calendar' },
}
