'use strict'
// Livello dati: SQLite locale tramite il modulo integrato node:sqlite (nessun modulo nativo da compilare).
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')

const validation = require('./validation')
const SCHEMA_VERSION = 5

const SCHEMA = `
CREATE TABLE IF NOT EXISTS anagrafica (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL DEFAULT 'persona',        -- persona | azienda
  ruolo TEXT NOT NULL DEFAULT 'cliente',       -- cliente | controparte | altro
  denominazione TEXT NOT NULL,
  codice_fiscale TEXT, partita_iva TEXT,
  email TEXT, pec TEXT, telefono TEXT,
  indirizzo TEXT, cap TEXT, citta TEXT, provincia TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS pratiche (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT, titolo TEXT NOT NULL,
  cliente_id INTEGER REFERENCES anagrafica(id) ON DELETE SET NULL,
  controparte_id INTEGER REFERENCES anagrafica(id) ON DELETE SET NULL,
  tipo TEXT, stato TEXT, colore TEXT NOT NULL DEFAULT '#3b82f6',
  autorita TEXT, giudice TEXT, rg TEXT, valore REAL,
  data_apertura TEXT, data_chiusura TEXT,
  descrizione TEXT, preferita INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS scadenze (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pratica_id INTEGER REFERENCES pratiche(id) ON DELETE CASCADE,
  titolo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'scadenza', -- scadenza | udienza | appuntamento | altro
  data_ora TEXT NOT NULL,                       -- YYYY-MM-DDTHH:mm (ora locale)
  tutto_il_giorno INTEGER NOT NULL DEFAULT 0,
  luogo TEXT, note TEXT,
  promemoria TEXT NOT NULL DEFAULT '[]',        -- JSON: minuti prima, es. [1440,60]
  completata INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pratica_id INTEGER REFERENCES pratiche(id) ON DELETE CASCADE,
  titolo TEXT NOT NULL, note TEXT,
  scadenza TEXT,                                -- YYYY-MM-DD o YYYY-MM-DDTHH:mm
  priorita INTEGER NOT NULL DEFAULT 1,          -- 0 bassa, 1 normale, 2 alta
  promemoria_min INTEGER,                       -- minuti prima della scadenza (NULL = nessuno)
  completata INTEGER NOT NULL DEFAULT 0, completata_il TEXT,
  ordine INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS note (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pratica_id INTEGER NOT NULL REFERENCES pratiche(id) ON DELETE CASCADE,
  testo TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS documenti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pratica_id INTEGER NOT NULL REFERENCES pratiche(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, file TEXT NOT NULL DEFAULT '', -- copia interna: percorso relativo a <dati>/documenti (vuoto per i documenti collegati)
  dimensione INTEGER, categoria TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pratica_id INTEGER REFERENCES pratiche(id) ON DELETE CASCADE, -- NULL = globale
  titolo TEXT NOT NULL, url TEXT NOT NULL, categoria TEXT, descrizione TEXT,
  colore TEXT, ordine INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS ore (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pratica_id INTEGER NOT NULL REFERENCES pratiche(id) ON DELETE CASCADE,
  data TEXT NOT NULL, minuti INTEGER NOT NULL, descrizione TEXT NOT NULL,
  tariffa_oraria REAL NOT NULL DEFAULT 0,
  parcella_id INTEGER REFERENCES parcelle(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS spese (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pratica_id INTEGER NOT NULL REFERENCES pratiche(id) ON DELETE CASCADE,
  data TEXT NOT NULL, descrizione TEXT NOT NULL, importo REAL NOT NULL DEFAULT 0,
  esente INTEGER NOT NULL DEFAULT 1,            -- 1 = anticipazione esente IVA (art. 15)
  parcella_id INTEGER REFERENCES parcelle(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS parcelle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anno INTEGER NOT NULL, progressivo INTEGER NOT NULL, numero TEXT NOT NULL,
  pratica_id INTEGER REFERENCES pratiche(id) ON DELETE SET NULL,
  cliente_id INTEGER REFERENCES anagrafica(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'parcella',        -- preventivo | parcella
  data TEXT NOT NULL, oggetto TEXT,
  stato TEXT NOT NULL DEFAULT 'bozza',          -- bozza | emessa | pagata | annullata
  data_pagamento TEXT,
  sg_perc REAL NOT NULL DEFAULT 0, cpa_perc REAL NOT NULL DEFAULT 0,
  iva_perc REAL NOT NULL DEFAULT 0, rit_perc REAL NOT NULL DEFAULT 0,
  bollo REAL NOT NULL DEFAULT 0,
  compensi REAL NOT NULL DEFAULT 0, spese_generali REAL NOT NULL DEFAULT 0,
  cpa REAL NOT NULL DEFAULT 0, imponibile REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 0, spese_esenti REAL NOT NULL DEFAULT 0,
  ritenuta REAL NOT NULL DEFAULT 0, totale REAL NOT NULL DEFAULT 0, netto REAL NOT NULL DEFAULT 0,
  note TEXT, importazione TEXT, calcolo TEXT,                      -- calcolo: JSON con lo stato del calcolatore dei compensi
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS voci_parcella (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parcella_id INTEGER NOT NULL REFERENCES parcelle(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'compenso',        -- compenso | spesa_esente | spesa_imponibile
  descrizione TEXT NOT NULL, quantita REAL NOT NULL DEFAULT 1, importo REAL NOT NULL DEFAULT 0,
  ordine INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notifiche (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titolo TEXT NOT NULL, corpo TEXT, tipo TEXT NOT NULL DEFAULT 'scadenza',
  rif_tipo TEXT, rif_id INTEGER, pratica_id INTEGER,
  letta INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- Calendari esterni collegati in SOLA LETTURA (Cliens Più, Google Calendar, Outlook…): l'app scarica il file del calendario, non scrive mai nulla all'esterno
CREATE TABLE IF NOT EXISTS calendari (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL, url TEXT NOT NULL, colore TEXT NOT NULL DEFAULT '#0ea5e9',
  attivo INTEGER NOT NULL DEFAULT 1, intervallo_min INTEGER NOT NULL DEFAULT 30,
  promemoria TEXT NOT NULL DEFAULT '[60]',      -- avvisi locali per gli eventi del calendario (minuti prima)
  ultimo_sync TEXT, ultimo_tentativo TEXT, ultimo_esito TEXT, ultimo_errore TEXT, etag TEXT, n_eventi INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS eventi_esterni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendario_id INTEGER NOT NULL REFERENCES calendari(id) ON DELETE CASCADE,
  chiave TEXT NOT NULL,                         -- UID dell'evento (+ inizio originale per le ripetizioni)
  titolo TEXT NOT NULL, descrizione TEXT, luogo TEXT,
  inizio TEXT NOT NULL, fine TEXT, tutto_il_giorno INTEGER NOT NULL DEFAULT 0,
  pratica_id INTEGER REFERENCES pratiche(id) ON DELETE SET NULL,   -- collegamento locale a una pratica (non viene mai inviato all'esterno)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (calendario_id, chiave)
);
CREATE INDEX IF NOT EXISTS idx_eventi_esterni_inizio ON eventi_esterni(inizio);
-- pratiche riconosciute negli eventi di un calendario collegato (es. Cliens Cube): quale gruppo di eventi corrisponde a quale pratica.
-- pratica_id NULL = l'utente non l'ha voluta (o l'ha eliminata): non va riproposta né ricreata in automatico.
CREATE TABLE IF NOT EXISTS pratiche_da_calendario (
  calendario_id INTEGER NOT NULL REFERENCES calendari(id) ON DELETE CASCADE,
  chiave TEXT NOT NULL,
  pratica_id INTEGER REFERENCES pratiche(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (calendario_id, chiave)
);
CREATE TABLE IF NOT EXISTS cronologia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pratica_id INTEGER NOT NULL REFERENCES pratiche(id) ON DELETE CASCADE,
  tabella TEXT NOT NULL, rec_id INTEGER, azione TEXT NOT NULL, testo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_cronologia_pratica ON cronologia(pratica_id, id);
CREATE TABLE IF NOT EXISTS documenti_testo (documento_id INTEGER PRIMARY KEY REFERENCES documenti(id) ON DELETE CASCADE, testo TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS alert_fired (key TEXT PRIMARY KEY, fired_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_pratiche_cliente ON pratiche(cliente_id);
CREATE INDEX IF NOT EXISTS idx_scadenze_data ON scadenze(data_ora);
CREATE INDEX IF NOT EXISTS idx_scadenze_pratica ON scadenze(pratica_id);
CREATE INDEX IF NOT EXISTS idx_todos_pratica ON todos(pratica_id);
CREATE INDEX IF NOT EXISTS idx_documenti_pratica ON documenti(pratica_id);
CREATE INDEX IF NOT EXISTS idx_ore_pratica ON ore(pratica_id);
CREATE INDEX IF NOT EXISTS idx_spese_pratica ON spese(pratica_id);
`

// tabelle esposte al renderer; 'children' = tabelle figlie dipendenti dal documento
const TABLES = [
  'anagrafica', 'pratiche', 'scadenze', 'todos', 'note', 'documenti', 'link',
  'ore', 'spese', 'parcelle', 'voci_parcella', 'notifiche', 'calendari', 'eventi_esterni', 'cronologia',
]

let db = null
let dataDir = null
let recoveryResult = null
const colCache = {}

function open(dir, { restoring = false } = {}) {
  dataDir = dir
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') fs.chmodSync(dir, 0o700)
  if (!restoring) recoveryResult = require('./restore-state').recover(dir)
  fs.mkdirSync(path.join(dir, 'documenti'), { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') fs.chmodSync(path.join(dir, 'documenti'), 0o700)
  // compatibilità: le versioni precedenti usavano lara.db
  const legacy = path.join(dir, 'lara.db')
  if (!fs.existsSync(path.join(dir, 'mngmnt.db')) && fs.existsSync(legacy)) {
    for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(legacy + ext)) fs.renameSync(legacy + ext, path.join(dir, 'mngmnt.db' + ext))
  }
  db = new DatabaseSync(path.join(dir, 'mngmnt.db'))
  if (process.platform !== 'win32') fs.chmodSync(path.join(dir, 'mngmnt.db'), 0o600)
  db.exec('PRAGMA busy_timeout = 10000;') // prima di tutto: attende invece di fallire se l'archivio è momentaneamente bloccato
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  if (db.prepare('PRAGMA user_version').get().user_version > SCHEMA_VERSION) {
    const error = new Error('Archivio creato con una versione più recente: aggiorna TIO prima di aprirlo')
    error.code = 'ARCHIVE_NEWER_VERSION'; throw error
  }
  db.exec('BEGIN IMMEDIATE')
  try {
  db.exec(SCHEMA)
  // migrazione: colonna `calcolo` aggiunta alle parcelle esistenti
  if (!db.prepare('PRAGMA table_info(parcelle)').all().some((c) => c.name === 'calcolo')) db.exec('ALTER TABLE parcelle ADD COLUMN calcolo TEXT')
  // migrazioni: attività svolte (ore con note e allegati)
  if (!db.prepare('PRAGMA table_info(ore)').all().some((c) => c.name === 'dettagli')) db.exec('ALTER TABLE ore ADD COLUMN dettagli TEXT')
  if (!db.prepare('PRAGMA table_info(documenti)').all().some((c) => c.name === 'ora_id')) db.exec('ALTER TABLE documenti ADD COLUMN ora_id INTEGER REFERENCES ore(id) ON DELETE SET NULL')
  db.exec('CREATE INDEX IF NOT EXISTS idx_documenti_ora ON documenti(ora_id)')
  // documenti collegati: il file resta dove l'ha messo l'utente, l'app ricorda il percorso (percorso = NULL: copia interna delle versioni precedenti)
  const colDoc = db.prepare('PRAGMA table_info(documenti)').all().map((c) => c.name)
  for (const [nome, tipo] of [['percorso', 'TEXT'], ['impronta', 'TEXT'], ['rel', 'TEXT']]) if (!colDoc.includes(nome)) db.exec(`ALTER TABLE documenti ADD COLUMN ${nome} ${tipo}`)
  if (!db.prepare('PRAGMA table_info(pratiche)').all().some((c) => c.name === 'cartella')) db.exec('ALTER TABLE pratiche ADD COLUMN cartella TEXT')
  // calendari: creare in automatico le pratiche riconosciute negli eventi (spento finché l'utente non lo sceglie)
  if (!db.prepare('PRAGMA table_info(calendari)').all().some((c) => c.name === 'crea_pratiche')) db.exec('ALTER TABLE calendari ADD COLUMN crea_pratiche INTEGER NOT NULL DEFAULT 0')
  const ti = db.prepare('PRAGMA table_info(documenti_testo)').all().map((c) => c.name)
  for (const [name, type] of [['versione', 'INTEGER NOT NULL DEFAULT 1'], ['stato', "TEXT DEFAULT 'testo'"], ['errore', 'TEXT'], ['sorgente', 'TEXT']]) if (!ti.includes(name)) db.exec(`ALTER TABLE documenti_testo ADD COLUMN ${name} ${type}`)
  const pc = db.prepare('PRAGMA table_info(parcelle)').all().map((c) => c.name)
  for (const [name, type] of [['incassato', 'REAL NOT NULL DEFAULT 0'], ['scadenza_pagamento', 'TEXT']]) if (!pc.includes(name)) db.exec(`ALTER TABLE parcelle ADD COLUMN ${name} ${type}`)
  if (!pc.includes('importazione')) db.exec('ALTER TABLE parcelle ADD COLUMN importazione TEXT')
  for (const [name, type] of [['validita', 'TEXT'], ['esito_preventivo', "TEXT NOT NULL DEFAULT 'da_inviare'"], ['origine_preventivo_id', 'INTEGER REFERENCES parcelle(id) ON DELETE SET NULL'], ['contributo_nome', 'TEXT'], ['contributo_ritenuta', 'INTEGER NOT NULL DEFAULT 0'], ['incassi_dettagliati', 'INTEGER NOT NULL DEFAULT 0']]) if (!pc.includes(name)) db.exec(`ALTER TABLE parcelle ADD COLUMN ${name} ${type}`)
  // nota di credito: riferimento alla fattura stornata
  if (!pc.includes('storno_di')) db.exec('ALTER TABLE parcelle ADD COLUMN storno_di INTEGER REFERENCES parcelle(id) ON DELETE SET NULL')
  // modelli Word dell'utente (sezione Documenti): il file .docx intero, così entra nei backup dell'archivio
  db.exec('CREATE TABLE IF NOT EXISTS modelli_word (id TEXT PRIMARY KEY, nome TEXT NOT NULL, dati BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime(\'now\',\'localtime\')))')
  const prCols = db.prepare('PRAGMA table_info(pratiche)').all().map(c => c.name)
  for (const [name, type] of [['budget_ore', 'REAL'], ['budget_importo', 'REAL'], ['consegna', 'TEXT']]) if (!prCols.includes(name)) db.exec(`ALTER TABLE pratiche ADD COLUMN ${name} ${type}`)
  db.exec(`CREATE TABLE IF NOT EXISTS pagamenti (
    id INTEGER PRIMARY KEY AUTOINCREMENT, parcella_id INTEGER NOT NULL REFERENCES parcelle(id) ON DELETE CASCADE,
    data TEXT, importo REAL NOT NULL CHECK(importo>0), metodo TEXT NOT NULL, note TEXT, richiesta TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS costi (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pratica_id INTEGER REFERENCES pratiche(id) ON DELETE SET NULL,
    fornitore_id INTEGER REFERENCES anagrafica(id) ON DELETE SET NULL, data TEXT NOT NULL, descrizione TEXT NOT NULL,
    categoria TEXT NOT NULL, importo REAL NOT NULL CHECK(importo>=0), scadenza TEXT, pagata INTEGER NOT NULL DEFAULT 0, recuperabile INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS ricorrenze (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pratica_id INTEGER REFERENCES pratiche(id) ON DELETE CASCADE, titolo TEXT NOT NULL,
    frequenza TEXT NOT NULL, prossima TEXT NOT NULL, giorno INTEGER NOT NULL, attiva INTEGER NOT NULL DEFAULT 1);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_documento_preventivo ON parcelle(origine_preventivo_id) WHERE origine_preventivo_id IS NOT NULL;`)
  if (!db.prepare('PRAGMA table_info(ricorrenze)').all().some((c) => c.name === 'lavorativo')) db.exec('ALTER TABLE ricorrenze ADD COLUMN lavorativo INTEGER NOT NULL DEFAULT 0')
  db.exec("UPDATE parcelle SET incassato = netto WHERE stato = 'pagata' AND incassato = 0")
  db.exec(`CREATE INDEX IF NOT EXISTS idx_parcelle_serie ON parcelle(anno,tipo,numero);
    CREATE TRIGGER IF NOT EXISTS parcelle_numero_insert BEFORE INSERT ON parcelle WHEN EXISTS(SELECT 1 FROM parcelle WHERE anno=NEW.anno AND tipo=NEW.tipo AND numero=NEW.numero) BEGIN SELECT RAISE(ABORT,'Numero di documento già utilizzato in questa serie'); END;
    CREATE TRIGGER IF NOT EXISTS parcelle_numero_update BEFORE UPDATE OF anno,tipo,numero ON parcelle WHEN (NEW.anno<>OLD.anno OR NEW.tipo<>OLD.tipo OR NEW.numero<>OLD.numero) AND EXISTS(SELECT 1 FROM parcelle WHERE anno=NEW.anno AND tipo=NEW.tipo AND numero=NEW.numero AND id<>NEW.id) BEGIN SELECT RAISE(ABORT,'Numero di documento già utilizzato in questa serie'); END;`)
  const row = db.prepare('PRAGMA user_version').get()
  if (row.user_version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  for (const k of Object.keys(colCache)) delete colCache[k]
  return db
}

/**
 * Se l'archivio non si apre (file corrotto, disco danneggiato) lo mette da parte senza cancellarlo
 * e restituisce il nuovo nome, così l'app può ripartire da un archivio vuoto o da un backup.
 */
function isolaArchivioDanneggiato(dir) {
  const f = path.join(dir, 'mngmnt.db')
  const nuovo = `${f}.danneggiato-${Date.now()}`
  if (fs.existsSync(f)) fs.renameSync(f, nuovo)
  for (const ext of ['-wal', '-shm']) fs.rmSync(f + ext, { force: true })
  return nuovo
}

/** Controllo di integrità del file SQLite (true = tutto a posto). */
function verificaIntegrita() {
  try { return db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok' } catch { return false }
}

function close() {
  profondita = 0
  if (db) { try { db.close() } catch { /* già chiuso */ } }
  db = null
}

const getDb = () => db
const getDataDir = () => dataDir

function assertTable(t) {
  if (!TABLES.includes(t)) throw new Error(`Tabella non valida: ${t}`)
}

function columns(t) {
  if (!colCache[t]) colCache[t] = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
  return colCache[t]
}

// node:sqlite accetta solo null/number/bigint/string/Buffer
function norm(v) {
  if (v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') return v.replace(/\u0000/g, '') // SQLite tronca il testo al primo carattere NUL
  if (typeof v === 'object' && v !== null && !(v instanceof Uint8Array)) return JSON.stringify(v)
  return v
}

function list(t, where = {}, orderBy = 'id DESC') {
  assertTable(t)
  const cols = columns(t)
  const keys = Object.keys(where).filter((k) => cols.includes(k))
  const sql = `SELECT * FROM ${t}` +
    (keys.length ? ' WHERE ' + keys.map((k) => (where[k] === null ? `${k} IS NULL` : `${k} = ?`)).join(' AND ') : '') +
    ` ORDER BY ${safeOrder(orderBy, cols)}`
  return db.prepare(sql).all(...keys.filter((k) => where[k] !== null).map((k) => norm(where[k])))
}

function safeOrder(orderBy, cols) {
  const parts = String(orderBy).split(',').map((p) => p.trim()).filter(Boolean)
  const ok = parts.filter((p) => {
    const m = p.match(/^([a-z_]+)(?: COLLATE NOCASE)?(?: (ASC|DESC))?$/i)
    return !!m && cols.includes(m[1])
  })
  return ok.length ? ok.join(', ') : 'id DESC'
}

function get(t, id) {
  assertTable(t)
  id = validation.id(id)
  return db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(id) || null
}

function save(t, obj) {
  assertTable(t)
  validation.record(t, obj)
  if (t === 'parcelle') {
    const old = obj.id ? get(t, obj.id) : null
    if (obj.incassi_dettagliati !== undefined && Number(obj.incassi_dettagliati) !== Number(old?.incassi_dettagliati || 0)) throw new Error('Gestisci gli incassi dal registro dei pagamenti')
    if (old?.incassi_dettagliati && obj.incassato !== undefined && Math.abs(Number(obj.incassato)-old.incassato)>0.005) throw new Error('Gestisci importo incassato e stato dal registro dei pagamenti')
    // con il registro dei pagamenti lo stato si calcola dagli incassi: a mano si può solo annullare il documento o ripristinarlo
    if (old?.incassi_dettagliati && obj.stato !== undefined && obj.stato !== 'annullata' && old.stato !== 'annullata' && old.stato !== 'stornata') { obj = { ...obj }; delete obj.stato }
    if (old?.incassi_dettagliati && obj.netto !== undefined && Number(obj.netto) < old.incassato-0.005) throw new Error('Il netto non può essere inferiore ai pagamenti registrati')
  }
  const prima = obj.id && (CRONO[t] || t === 'pratiche') ? get(t, obj.id) : null
  let r = salva(t, obj)
  if (t === 'parcelle' && r?.incassi_dettagliati) { aggiornaIncassi(r.id); r = get(t, r.id) } // il netto può essere cambiato: stato e data di pagamento seguono
  if (t === 'documenti' && obj.id && ['percorso','file','impronta','dimensione'].some((key) => key in obj)) db.prepare('DELETE FROM documenti_testo WHERE documento_id=?').run(obj.id)
  if (CRONO[t]) logSalvataggio(t, prima, r)
  else if (t === 'pratiche' && r) {
    if (!prima) scriviCronologia(r.id, t, r.id, 'creato', 'Pratica aperta')
    else if (prima.stato !== r.stato) scriviCronologia(r.id, t, r.id, 'stato', `Stato: ${prima.stato || '—'} → ${r.stato || '—'}`)
  }
  return r
}

function salva(t, obj) {
  const cols = columns(t)
  const data = {}
  for (const k of Object.keys(obj)) {
    if (k !== 'id' && cols.includes(k) && k !== 'created_at') data[k] = norm(obj[k])
  }
  if (cols.includes('updated_at')) data.updated_at = localNow()
  const keys = Object.keys(data)
  if (obj.id) {
    if (keys.length) {
      db.prepare(`UPDATE ${t} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => data[k]), obj.id)
    }
    return get(t, obj.id)
  }
  const r = keys.length
    ? db.prepare(`INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => data[k]))
    : db.prepare(`INSERT INTO ${t} DEFAULT VALUES`).run()
  return get(t, Number(r.lastInsertRowid))
}

function remove(t, id) {
  assertTable(t)
  id = validation.id(id)
  if (CRONO[t]) { const r = get(t, id); if (r) scriviCronologia(r.pratica_id, t, id, 'eliminato', descrivi(t, r)) }
  db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(id)
  return true
}

// ---- cronologia della pratica: chi/cosa/quando, scritta qui così vale per qualsiasi punto dell'app che salva dati ----
const CRONO = { scadenze: 'Scadenza', todos: 'Compito', note: 'Nota', documenti: 'Documento', ore: 'Attività', spese: 'Spesa', parcelle: 'Documento contabile' }
let cronologiaAttiva = true
/** Sospende la cronologia durante operazioni di massa (importazioni): chi le esegue scrive poi una sola riga riassuntiva. */
function senzaCronologia(fn) { const prima = cronologiaAttiva; cronologiaAttiva = false; try { return fn() } finally { cronologiaAttiva = prima } }
function descrivi(t, r) {
  const x = t === 'scadenze' || t === 'todos' ? r.titolo : t === 'note' ? String(r.titolo || r.testo || '').split('\n')[0].slice(0, 80) : t === 'documenti' ? r.nome : t === 'ore' ? r.descrizione : t === 'spese' ? r.descrizione : t === 'parcelle' ? r.numero : ''
  return `${CRONO[t]}${x ? ' «' + x + '»' : ''}`
}
function scriviCronologia(praticaId, tabella, recId, azione, testo) {
  if (!cronologiaAttiva || !praticaId) return
  try { db.prepare('INSERT INTO cronologia (pratica_id, tabella, rec_id, azione, testo) VALUES (?,?,?,?,?)').run(praticaId, tabella, recId ?? null, azione, testo) } catch { /* la cronologia non deve mai impedire di salvare */ }
}
function logSalvataggio(t, prima, r) {
  if (!r) return
  if (!prima) { scriviCronologia(r.pratica_id, t, r.id, 'creato', descrivi(t, r)); return }
  if ((t === 'scadenze' || t === 'todos') && Number(prima.completata) !== Number(r.completata)) scriviCronologia(r.pratica_id, t, r.id, r.completata ? 'completato' : 'riaperto', descrivi(t, r))
}
/** Reinserisce una riga eliminata (annulla): stesso id, stessi valori. */
function ripristina(t, riga) {
  assertTable(t)
  const cols = columns(t), keys = Object.keys(riga).filter((k) => cols.includes(k))
  if (!keys.includes('id')) throw new Error('Riga non valida')
  db.prepare(`INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => norm(riga[k])))
  db.prepare("DELETE FROM cronologia WHERE id = (SELECT MAX(id) FROM cronologia WHERE tabella = ? AND rec_id = ? AND azione = 'eliminato')").run(t, riga.id)
  return get(t, riga.id)
}

function localNow() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

let profondita = 0
/** Transazione annidabile: la più esterna usa BEGIN/COMMIT, quelle interne i savepoint (rollback parziale in caso di errore). */
function transaction(fn) {
  const sp = `sp_${profondita}`
  db.exec(profondita === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
  profondita++
  try {
    const r = fn()
    profondita--
    db.exec(profondita === 0 ? 'COMMIT' : `RELEASE ${sp}`)
    return r
  } catch (e) {
    profondita--
    try {
      if (profondita === 0) db.exec('ROLLBACK')
      else { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`) }
    } catch { /* nessuna transazione attiva */ }
    throw e
  }
}

// ---- impostazioni ----
function getSettings() {
  const out = {}
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    try { out[r.key] = JSON.parse(r.value) } catch { out[r.key] = r.value }
  }
  return out
}

function setSettings(obj) {
  const st = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  transaction(() => {
    if (obj.stati_pratica && Array.isArray(obj.stati_pratica)) {
      const old = getSettings().stati_pratica || [], next = obj.stati_pratica
      const names = next.map((state) => String(state.nome || '').trim())
      if (names.some((name) => !name) || new Set(names).size !== names.length) throw new Error('Ogni stato deve avere un nome diverso e non vuoto')
      const renames = next.map((state, i) => ({ from: state._nomePrecedente || (old.length === next.length ? old[i]?.nome : state.nome), to: names[i] })).filter((change) => change.from && change.from !== change.to)
      if (renames.length) {
        const cases = renames.map(() => 'WHEN ? THEN ?').join(' '), placeholders = renames.map(() => '?').join(',')
        db.prepare(`UPDATE pratiche SET stato = CASE stato ${cases} ELSE stato END, updated_at = ? WHERE stato IN (${placeholders})`).run(...renames.flatMap((change) => [change.from, change.to]), localNow(), ...renames.map((change) => change.from))
      }
      obj = { ...obj, stati_pratica: next.map(({ _nomePrecedente, ...state }, i) => ({ ...state, nome: names[i] })) }
    }
    for (const [k, v] of Object.entries(obj)) st.run(k, JSON.stringify(v))
  })
  return getSettings()
}

// ---- operazioni composte ----
function nextPraticaNumero() {
  const y = new Date().getFullYear()
  const r = db.prepare("SELECT numero FROM pratiche WHERE numero LIKE ?").all(`${y}/%`)
  let max = 0
  for (const x of r) {
    const n = parseInt(String(x.numero).split('/')[1], 10)
    if (n > max) max = n
  }
  return `${y}/${String(max + 1).padStart(3, '0')}`
}

// Le note pro forma hanno una numerazione propria ("PF 1/2026") per non consumare i numeri delle parcelle.
function nextParcellaNumero(anno, tipo = 'parcella') {
  const pf = tipo === 'proforma'
  const r = db.prepare("SELECT MAX(progressivo) AS m FROM parcelle WHERE anno = ? AND tipo = ?").get(anno, tipo)
  const progressivo = (r.m || 0) + 1
  return { anno, progressivo, numero: pf ? `PF ${progressivo}/${anno}` : tipo === 'preventivo' ? `PR ${progressivo}/${anno}` : tipo === 'nota_credito' ? `NC ${progressivo}/${anno}` : `${progressivo}/${anno}` }
}

/**
 * Nota di credito che storna per intero una fattura emessa: stesse voci, aliquote e importi (positivi, come vuole lo SdI),
 * numerazione propria «NC n/anno». La fattura resta com'era ma diventa «stornata»: non è più da incassare e i totali
 * dell'emesso la compensano con la nota.
 */
function creaNotaCredito(id, data = new Date().toISOString().slice(0, 10)) {
  return transaction(() => {
    const f = getParcella(Number(id))
    if (!f) throw new Error('Documento non trovato')
    if (f.tipo !== 'parcella') throw new Error('La nota di credito si emette soltanto per una fattura')
    if (!['emessa', 'pagata'].includes(f.stato)) throw new Error('Si può stornare soltanto una fattura emessa')
    if (db.prepare("SELECT 1 FROM parcelle WHERE tipo='nota_credito' AND storno_di=?").get(f.id)) throw new Error('Questa fattura ha già una nota di credito')
    const campi = ['pratica_id', 'cliente_id', 'sg_perc', 'cpa_perc', 'iva_perc', 'rit_perc', 'bollo', 'compensi', 'spese_generali', 'cpa', 'imponibile', 'iva', 'spese_esenti', 'ritenuta', 'totale', 'netto', 'contributo_nome', 'contributo_ritenuta']
    const nc = saveParcella({
      ...Object.fromEntries(campi.map((k) => [k, f[k]])), ...nextParcellaNumero(Number(data.slice(0, 4)), 'nota_credito'),
      tipo: 'nota_credito', data, stato: 'emessa', storno_di: f.id,
      oggetto: `Storno totale della fattura n. ${f.numero} del ${f.data.split('-').reverse().join('/')}${f.oggetto ? ` – ${f.oggetto}` : ''}`,
      voci: f.voci.map(({ tipo, descrizione, quantita, importo }) => ({ tipo, descrizione, quantita, importo })),
    })
    db.prepare("UPDATE parcelle SET stato='stornata' WHERE id=?").run(f.id)
    return nc
  })
}

/** Incassato, stato e data di pagamento di un documento dal registro dei pagamenti; un documento annullato resta annullato. */
function aggiornaIncassi(id) {
  const p = get('parcelle', id), rows = db.prepare('SELECT COALESCE(SUM(importo),0) AS n, MAX(data) AS ultima FROM pagamenti WHERE parcella_id=?').get(id)
  const n = Math.round(rows.n * 100) / 100, pagata = Math.round(n * 100) === Math.round(p.netto * 100)
  const stato = p.stato === 'annullata' || p.stato === 'stornata' ? p.stato : pagata ? 'pagata' : 'emessa'
  db.prepare('UPDATE parcelle SET incassato=?, incassi_dettagliati=1, stato=?, data_pagamento=? WHERE id=?').run(n, stato, stato === 'pagata' ? rows.ultima : null, id)
}

function getParcella(id) {
  const p = get('parcelle', id)
  if (!p) return null
  p.voci = db.prepare('SELECT * FROM voci_parcella WHERE parcella_id = ? ORDER BY ordine, id').all(id)
  return p
}

function saveParcella(obj) {
  const voci = Array.isArray(obj.voci) ? obj.voci : []
  const importOre = Array.isArray(obj.importa_ore) ? obj.importa_ore : []
  const importSpese = Array.isArray(obj.importa_spese) ? obj.importa_spese : []
  return transaction(() => {
    const head = { ...obj }
    delete head.voci; delete head.importa_ore; delete head.importa_spese; delete head.verificaImportazione
    if (!head.id && !(head.numero && head.anno && head.progressivo)) { // numero già noto (importazione dallo storico): si conserva
      const anno = Number(head.anno) || new Date(head.data || Date.now()).getFullYear()
      Object.assign(head, nextParcellaNumero(anno, head.tipo))
    }
    const existing = head.id ? getParcella(head.id) : null
    head.importazione = require('./proforma-review').update(head, existing, voci, obj.verificaImportazione)
    if (existing) {
      if (head.tipo && head.tipo !== existing.tipo) {
        if (existing.stato !== 'bozza' || existing.incassato > 0) throw new Error('Il tipo di un documento emesso o incassato non può essere cambiato: crea un nuovo documento')
        Object.assign(head, nextParcellaNumero(existing.anno, head.tipo))
      } else Object.assign(head, { anno: existing.anno, progressivo: existing.progressivo, numero: existing.numero })
    }
    const year = head.anno || existing?.anno
    const number = head.numero || existing?.numero
    const kind = head.tipo || existing?.tipo || 'parcella'
    const duplicate = db.prepare("SELECT id FROM parcelle WHERE anno = ? AND numero = ? AND tipo = ? AND id <> ?").get(year, number, kind, Number(head.id) || 0)
    if (duplicate) throw new Error('Numero di documento già utilizzato in questa serie')
    const net = Number(head.netto ?? existing?.netto ?? 0)
    if (existing?.incassi_dettagliati) delete head.incassato // dal registro dei pagamenti
    else if ((head.stato || existing?.stato) === 'pagata') head.incassato = net
    if (Number(head.incassato ?? existing?.incassato ?? 0) > net) throw new Error('L’incasso non può superare il netto del documento')
    for (const v of voci) validation.record('voci_parcella', v)
    const saved = save('parcelle', head)
    db.prepare('DELETE FROM voci_parcella WHERE parcella_id = ?').run(saved.id)
    const ins = db.prepare('INSERT INTO voci_parcella(parcella_id,tipo,descrizione,quantita,importo,ordine) VALUES(?,?,?,?,?,?)')
    voci.forEach((v, i) => ins.run(saved.id, v.tipo || 'compenso', String(v.descrizione || ''), Number(v.quantita) || 0, Number(v.importo) || 0, i))
    // sgancia ore/spese precedentemente collegate e collega quelle indicate
    db.prepare('UPDATE ore SET parcella_id = NULL WHERE parcella_id = ?').run(saved.id)
    db.prepare('UPDATE spese SET parcella_id = NULL WHERE parcella_id = ?').run(saved.id)
    for (const id of importOre) db.prepare('UPDATE ore SET parcella_id = ? WHERE id = ?').run(saved.id, id)
    for (const id of importSpese) db.prepare('UPDATE spese SET parcella_id = ? WHERE id = ?').run(saved.id, id)
    return getParcella(saved.id)
  })
}

function reorderTodos(ids) {
  const st = db.prepare('UPDATE todos SET ordine = ? WHERE id = ?')
  transaction(() => ids.forEach((id, i) => st.run(i, id)))
  return true
}

function searchAll(q) {
  const testo = String(q ?? '').replace(/\u0000/g, '').trim().slice(0, 100) // SQLite rifiuta pattern LIKE troppo lunghi
  const s = `%${testo.replace(/[\\%_]/g, (m) => '\\' + m)}%`
  if (testo.length < 2) return []
  const like = (cols) => cols.map((c) => `${c} LIKE @s ESCAPE '\\'`).join(' OR ')
  const run = (sql) => db.prepare(sql).all({ s })
  const out = []
  for (const r of run(`SELECT id, titolo, numero, colore, rg FROM pratiche WHERE ${like(['titolo', 'numero', 'rg', 'autorita', 'descrizione'])} LIMIT 8`)) {
    out.push({ kind: 'pratica', id: r.id, title: r.titolo, sub: [r.numero, r.rg].filter(Boolean).join(' · '), color: r.colore })
  }
  for (const r of run(`SELECT id, denominazione, ruolo, email FROM anagrafica WHERE ${like(['denominazione', 'codice_fiscale', 'partita_iva', 'email'])} LIMIT 8`)) {
    out.push({ kind: 'anagrafica', id: r.id, title: r.denominazione, sub: r.ruolo })
  }
  for (const r of run(`SELECT s.id, s.titolo, s.data_ora, s.pratica_id, p.colore FROM scadenze s LEFT JOIN pratiche p ON p.id = s.pratica_id WHERE ${like(['s.titolo', 's.note', 's.luogo'])} LIMIT 8`)) {
    out.push({ kind: 'scadenza', id: r.id, pratica_id: r.pratica_id, title: r.titolo, sub: r.data_ora.replace('T', ' '), color: r.colore })
  }
  for (const r of run(`SELECT e.id, e.titolo, e.inizio, e.pratica_id, c.colore, c.nome AS cal FROM eventi_esterni e JOIN calendari c ON c.id = e.calendario_id WHERE ${like(['e.titolo', 'e.descrizione', 'e.luogo'])} ORDER BY e.inizio DESC LIMIT 8`)) {
    out.push({ kind: 'evento', id: r.id, pratica_id: r.pratica_id, title: r.titolo, sub: `${r.cal} · ${r.inizio.replace('T', ' ')}`, color: r.colore })
  }
  for (const r of run(`SELECT t.id, t.titolo, t.pratica_id, p.colore FROM todos t LEFT JOIN pratiche p ON p.id = t.pratica_id WHERE ${like(['t.titolo', 't.note'])} LIMIT 8`)) {
    out.push({ kind: 'todo', id: r.id, pratica_id: r.pratica_id, title: r.titolo, sub: 'To-do', color: r.colore })
  }
  for (const r of run(`SELECT d.id, d.nome, d.pratica_id, p.colore FROM documenti d LEFT JOIN pratiche p ON p.id = d.pratica_id WHERE ${like(['d.nome'])} LIMIT 8`)) {
    out.push({ kind: 'documento', id: r.id, pratica_id: r.pratica_id, title: r.nome, sub: 'Documento', color: r.colore })
  }
  for (const r of run(`SELECT n.id, n.testo, n.pratica_id, p.colore FROM note n LEFT JOIN pratiche p ON p.id = n.pratica_id WHERE ${like(['n.testo'])} LIMIT 6`)) {
    out.push({ kind: 'nota', id: r.id, pratica_id: r.pratica_id, title: r.testo.slice(0, 80), sub: 'Nota', color: r.colore })
  }
  return out
}

function openForBackup(dir) {
  dataDir = dir
  db = new DatabaseSync(path.join(dir, 'mngmnt.db'), { readOnly: true })
  db.exec('PRAGMA busy_timeout = 10000')
}

module.exports = { openForBackup,
  getRecoveryResult: () => recoveryResult,
  open, close, isolaArchivioDanneggiato, verificaIntegrita, getDb, getDataDir, list, get, save, remove, transaction, localNow,
  getSettings, setSettings, nextPraticaNumero, nextParcellaNumero,
  getParcella, saveParcella, reorderTodos, searchAll, TABLES, ripristina, senzaCronologia, scriviCronologia,
}

module.exports.SCHEMA_VERSION = SCHEMA_VERSION
module.exports.aggiornaIncassi = aggiornaIncassi
module.exports.creaNotaCredito = creaNotaCredito
module.exports.backupBusinessSchema = {
  pagamenti:['id','parcella_id','data','importo','metodo','note','richiesta'], costi:['id','pratica_id','fornitore_id','data','descrizione','categoria','importo','scadenza','pagata','recuperabile'], ricorrenze:['id','pratica_id','titolo','frequenza','prossima','giorno','attiva'],
  pratiche:['budget_ore','budget_importo','consegna'], parcelle:['validita','esito_preventivo','origine_preventivo_id','contributo_nome','contributo_ritenuta','incassi_dettagliati'],
}
module.exports.backupSchema = Object.fromEntries([...SCHEMA.replace(/--[^\n]*/g, '').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\);/g)].map((m) => [m[1], m[2].split(',').map((v) => v.trim().match(/^(\w+)\s+(?:INTEGER|TEXT|REAL)\b/i)?.[1]).filter(Boolean)]))
