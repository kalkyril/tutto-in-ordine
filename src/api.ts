import type { SearchHit } from './types'

declare global {
  interface Window {
    mngmnt: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
      on: (event: 'data-changed' | 'navigate' | 'blocca' | 'menu' | 'time-changed', cb: (payload: any) => void) => () => void
      pathForFile: (f: File) => string
      platform: string
      test?: boolean
    }
  }
}

export interface RapportoSync { controllati: number; ok: number; ritrovati: { id: number; nome: string; da: string; a: string; come: string }[]; mancanti: { id: number; nome: string; percorso: string; pratica_id: number }[]; ambigui: { id: number; nome: string; percorso: string; candidati: string[] }[]; incompleto: boolean }

const inv = async (ch: string, ...a: any[]) => {
  const result = await window.mngmnt.invoke(ch, ...a)
  if (['db:save', 'parcella:save', 'settings:set', 'documenti:rename'].includes(ch)) window.dispatchEvent(new Event('mngmnt-saved'))
  return result
}

export interface OpzioniFatturaXml { tipoDocumento?: string; regime?: string; tipoCassa?: string; natura?: string; codiceDestinatario?: string; pecDestinatario?: string; tipoRitenuta?: string; cessionario?: { nome?: string; cognome?: string; denominazione?: string } }
export interface InfoWord { id: string; nome: string; campi: string[]; anteprima: string; dimensione: number }
export interface DocumentoAperto { id?: number; nome: string; testo: string; tipo: string; stato: string }

export interface SnapshotEliminato { token: string; t: string; riga: Record<string, unknown> & { id: number }; docIds: number[] }

export const api = {
  gestione: (azione: string, dati: Record<string, any> = {}): Promise<any> => inv('app:gestione', azione, dati),
  list: <T = any>(t: string, where?: Record<string, any>, order?: string): Promise<T[]> => inv('db:list', t, where, order),
  get: <T = any>(t: string, id: number): Promise<T | null> => inv('db:get', t, id),
  save: <T = any>(t: string, obj: Record<string, any>): Promise<T> => inv('db:save', t, obj),
  remove: (t: string, id: number): Promise<boolean> => inv('db:delete', t, id),
  removeUndo: (t: string, id: number): Promise<SnapshotEliminato | null> => inv('db:deleteUndo', t, id),
  undo: (snap: SnapshotEliminato): Promise<unknown> => inv('db:undo', snap),
  search: (q: string): Promise<SearchHit[]> => inv('db:search', q),
  settings: () => inv('settings:get'),
  setSettings: (o: Record<string, any>) => inv('settings:set', o),
  nextPraticaNumero: (): Promise<string> => inv('pratica:nextNumero'),
  getParcella: (id: number) => inv('parcella:get', id),
  saveParcella: (o: Record<string, any>) => inv('parcella:save', o),
  nextParcella: (anno: number, tipo?: string) => inv('parcella:next', anno, tipo),
  tariffeCompetenze: (): Promise<{ cod: number; nome: string; ambito: 'stragiudiziale' | 'civile' | 'penale'; anni: number[] }[]> => inv('tariffe:competenze'),
  tariffeStruttura: (anno: number, competenza: number) => inv('tariffe:struttura', anno, competenza),
  tariffeValori: (q: { anno: number; competenza: number; scaglione: number; valore?: number }) => inv('tariffe:valori', q),
  apriCalcolatoreOnline: () => inv('tariffe:apriSito'),
  reorderTodos: (ids: number[]) => inv('todos:reorder', ids),
  addDocumenti: (praticaId: number, categoria?: string, oraId?: number) => inv('documenti:add', praticaId, categoria, oraId),
  addDocumentiPaths: (praticaId: number, paths: string[], categoria?: string, oraId?: number) => inv('documenti:addPaths', praticaId, paths, categoria, oraId),
  // documenti collegati (i file restano nelle cartelle dell'utente)
  indiceDocumenti: (praticaId: number): Promise<{ id: number; stato: string | null; errore: string | null }[]> => inv('documenti:indice', praticaId),
  indicizzaDocumento: (id: number, ocr = false): Promise<{ caratteri: number; stato: string } | null> => inv('documenti:indicizza', id, ocr),
  statoDocumenti: (praticaId?: number): Promise<Record<number, 'ok' | 'mancante' | 'copia'>> => inv('documenti:stato', praticaId),
  sincronizzaDocumenti: (praticaId?: number): Promise<RapportoSync> => inv('documenti:sincronizza', praticaId),
  sincronizzaDocumentiIn: (praticaId?: number): Promise<RapportoSync | null> => inv('documenti:sincronizzaIn', praticaId),
  ricollegaDocumentoA: (id: number, percorso: string) => inv('documenti:ricollegaA', id, percorso),
  ricollegaDocumento: (id: number) => inv('documenti:ricollega', id),
  cartellaPratica: (praticaId: number): Promise<{ cartella: string; aggiornati: number } | null> => inv('documenti:cartellaPratica', praticaId),
  collegaCartella: (praticaId: number): Promise<{ collegati: number; gia: number; incompleto: boolean } | null> => inv('documenti:collegaCartella', praticaId),
  apriCartellaPratica: (praticaId: number): Promise<string> => inv('documenti:apriCartella', praticaId),
  scegliAllegati: (): Promise<string[]> => inv('documenti:scegli'),
  anteprimaDocumento: (id: number) => inv('documenti:anteprima', id),
  openDocumento: (id: number) => inv('documenti:open', id),
  revealDocumento: (id: number) => inv('documenti:reveal', id),
  renameDocumento: (id: number, nome: string) => inv('documenti:rename', id, nome),
  openExternal: (url: string) => inv('shell:openExternal', url),
  openLicenses: (): Promise<string> => inv('app:licenses'),
  apriGuida: (): Promise<string> => inv('app:guida'),
  openLicenseFolder: (): Promise<string> => inv('app:licenseFolder'),
  appInfo: () => inv('app:info'),
  avvioCompletato: () => inv('app:avvioCompletato'),
  controllaAggiornamenti: () => inv('app:controllaAggiornamenti') as Promise<{ versione: string; nuova: boolean; pagina: string } | null>,
  registraErrore: (testo: string): Promise<boolean> => inv('app:registraErrore', testo),
  mostraRegistro: (): Promise<string> => inv('app:mostraRegistro'),
  menuContestuale: (voci: ({ id: string; label: string; disattiva?: boolean } | '-')[]): Promise<string | null> => inv('app:menuContestuale', voci),
  openDataDir: () => inv('app:openDataDir'),
  markRead: (id?: number) => inv('notifiche:markRead', id),
  clearNotifiche: () => inv('notifiche:clear'),
  checkAlerts: () => inv('alerts:check'),
  testNotification: () => inv('alerts:test'),
  exportIcs: (praticaId?: number) => inv('ics:export', praticaId),
  printPdf: (html: string, nome: string, allegaAPratica?: number | null, categoria?: 'Documenti') => inv('pdf:print', html, nome, allegaAPratica || undefined, categoria),
  // Anonimizza: anonimizzazione dei documenti (i file restano dove sono; si scrive solo dove sceglie l'utente)
  anonApri: (ocr = false): Promise<DocumentoAperto | null> => inv('anonimizza:apri', ocr),
  anonApriPercorso: (percorso: string, ocr = false): Promise<DocumentoAperto> => inv('anonimizza:apriPercorso', percorso, ocr),
  anonRileggi: (id: number): Promise<DocumentoAperto> => inv('anonimizza:rileggi', id, true),
  anonSalva: (o: { nome: string; formato: string; documento?: unknown; sorgente?: number; sostituzioni?: { da: string; a: string; start?: number; end?: number }[] }): Promise<{ percorso: string; sostituzioni?: number; residui?: boolean } | null> => inv('anonimizza:salva', o),
  anonSalvaTesto: (nome: string, formato: 'txt' | 'md', testo: string): Promise<string | null> => inv('anonimizza:salvaTesto', nome, formato, testo),
  anonSalvaChiave: (nome: string, mappa: Record<string, string>): Promise<string | null> => inv('anonimizza:salvaChiave', nome, mappa),
  anonScegliCartella: (praticaId?: number | null): Promise<string | null> => inv('anonimizza:scegliCartella', praticaId),
  anonApriDocumento: (id: number, ocr = false): Promise<DocumentoAperto> => inv('anonimizza:apriDocumento', id, ocr),
  anonSalvaIn: (cartella: string, o: { nome: string; formato: string; documento?: unknown; sorgente?: number; sostituzioni?: { da: string; a: string; start?: number; end?: number }[] }): Promise<{ percorso: string; sostituzioni?: number; residui?: boolean }> => inv('anonimizza:salvaIn', cartella, o),
  anonSalvaChiaveIn: (cartella: string, nome: string, mappa: Record<string, string>): Promise<string> => inv('anonimizza:salvaChiaveIn', cartella, nome, mappa),
  anonMostraCartella: (cartella: string): Promise<boolean> => inv('anonimizza:mostraCartella', cartella),
  anonApriChiave: (): Promise<{ nome: string; mappa: Record<string, string> } | null> => inv('anonimizza:apriChiave'),
  // fattura elettronica FatturaPA (solo il file: l'invio allo SdI resta al canale dell'utente)
  opzioniFatturaXml: (): Promise<{ tipiDocumento: Record<string, string>; regimi: Record<string, string>; casse: Record<string, string>; nature: Record<string, string> }> => inv('parcella:opzioniXml'),
  notaCredito: (id: number): Promise<{ id: number; numero: string }> => inv('parcella:notaCredito', id),
  verificaFatturaXml: (id: number, opzioni: OpzioniFatturaXml): Promise<{ errori: string[]; avvisi: string[]; nomeFile: string }> => inv('parcella:verificaXml', id, opzioni),
  salvaFatturaXml: (id: number, opzioni: OpzioniFatturaXml): Promise<{ percorso: string; avvisi: string[] } | null> => inv('parcella:salvaXml', id, opzioni),
  // Documenti: file creati da un modello (il PDF passa da printPdf)
  importaModelloWord: (): Promise<InfoWord | null> => inv('modelli:importaWord'),
  sostituisciModelloWord: (id: string): Promise<InfoWord | null> => inv('modelli:sostituisciWord', id),
  infoModelloWord: (id: string): Promise<InfoWord> => inv('modelli:infoWord', id),
  duplicaModelloWord: (id: string, nuovo: string): Promise<InfoWord> => inv('modelli:duplicaWord', id, nuovo),
  eliminaModelloWord: (id: string): Promise<boolean> => inv('modelli:eliminaWord', id),
  scaricaModelloWord: (id: string): Promise<string | null> => inv('modelli:scaricaWord', id),
  creaDaModelloWord: (o: { id: string; valori: Record<string, string>; nome: string; praticaId?: number | null }): Promise<{ percorso: string; mancanti: string[] } | null> => inv('modelli:creaDaWord', o),
  esportaDocumento: (o: { nome: string; formato: string; documento: unknown; praticaId?: number | null }): Promise<string | null> => inv('modelli:esporta', o),
  previewPdf: (html: string, pagina = 1): Promise<{ immagine: string; pagina: number; pagine: number } | null> => inv('pdf:preview', html, pagina),
  // calendari esterni (sola lettura)
  salvaCalendario: (o: Record<string, any>) => inv('calendari:salva', o),
  eliminaCalendario: (id: number) => inv('calendari:elimina', id),
  sincronizzaCalendario: (id?: number | null) => inv('calendari:sincronizza', id ?? null),
  scegliFileCalendario: (): Promise<{ url: string; nome: string } | null> => inv('calendari:scegliFile'),
  anteprimaPraticheCalendario: (id: number) => inv('calendari:anteprimaPratiche', id),
  importaPraticheCalendario: (id: number, scelte: Record<string, boolean>, automatico: boolean) => inv('calendari:importaPratiche', id, scelte, automatico),
  provaCalendario: (url: string) => inv('calendari:prova', url),
  collegaEvento: (id: number, praticaId: number | null) => inv('eventi:collega', id, praticaId),
  // importazione da file e cartelle (sola lettura sui file di origine)
  scegliFileImport: (): Promise<{ percorso: string; nome: string } | null> => inv('import:scegliFile'),
  importaProforma: () => inv('import:proforma'),
  proponiImport: (tipo: string, file: string) => inv('import:proponi', tipo, file),
  anteprimaImport: (tipo: string, file: string, mappatura: Record<string, number>, opz: Record<string, any>) => inv('import:anteprima', tipo, file, mappatura, opz),
  eseguiImport: (tipo: string, file: string, mappatura: Record<string, number>, opz: Record<string, any>) => inv('import:esegui', tipo, file, mappatura, opz),
  modelloImport: (tipo: string): Promise<string | null> => inv('import:modello', tipo),
  scegliCartellaImport: (): Promise<{ percorso: string; nome: string } | null> => inv('import:scegliCartella'),
  anteprimaCartella: (dir: string) => inv('import:cartellaAnteprima', dir),
  eseguiCartella: (dir: string, scelte: Record<string, number | string>, opz: Record<string, any>) => inv('import:cartellaEsegui', dir, scelte, opz),
  // atto da uno esistente (il file di partenza è solo letto)
  salvaCopiaDocumento: (id: number): Promise<string | null> => inv('documenti:salvaCopia', id),
  salvaTesto: (nome: string, contenuto: string): Promise<string | null> => inv('documenti:salvaTesto', nome, contenuto),
  // blocco con password
  statoBlocco: (): Promise<{ attivo: boolean; bloccato: boolean; minuti: number }> => inv('app:statoBlocco'),
  sblocca: (password: string): Promise<boolean> => inv('app:sblocca', password),
  blocca: () => inv('app:blocca'),
  impostaBlocco: (nuova: string, minuti: number, vecchia?: string) => inv('app:impostaBlocco', nuova, minuti, vecchia),
  cambiaMinutiBlocco: (minuti: number, password: string) => inv('app:cambiaMinutiBlocco', minuti, password),
  rimuoviBlocco: (password: string) => inv('app:rimuoviBlocco', password),
  chooseFolder: (): Promise<string | null> => inv('backup:chooseFolder'),
  backupKeyStatus: (): Promise<{ enabled: boolean; available: boolean }> => inv('backup:keyStatus'),
  backupKeyConfigure: (password: string): Promise<{ enabled: boolean; available: boolean }> => inv('backup:keyConfigure', password),
  backupKeyDisable: (): Promise<{ enabled: boolean; available: boolean }> => inv('backup:keyDisable'),
  backup: (folder?: string, options?: { includeLinked?: boolean; password?: string }): Promise<string | null> => inv('backup:run', folder, options),
  restore: (password = '', verifyOnly = false): Promise<{ safety?: string; valido?: boolean; integritaFile?: boolean; documenti?: number; mancanti?: number; portabile?: boolean } | null> => inv('backup:restore', password, verifyOnly).then((result) => { if (result?.safety) window.dispatchEvent(new Event('archive-restored')); return result }),
}
