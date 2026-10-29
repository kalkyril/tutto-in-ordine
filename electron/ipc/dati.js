'use strict'
// Dati: lettura e scrittura generiche, impostazioni, operazioni composte (parcelle, compiti).
const fs = require('node:fs')
const db = require('../db')
const calendari = require('../calendari')
const doctext = require('../doctext')
const { praticaDir, docPath } = require('./percorsi')

module.exports = function registra({ handle, changed, onSettings }) {
  handle('app:gestione', (azione, dati) => {
    const r = require('../gestione').esegui(azione, dati)
    if (azione !== 'leggi') changed('gestione', 'parcelle', 'pratiche', 'todos')
    return r
  })
  handle('db:list', (t, where, order) => db.list(t, where || {}, order || 'id DESC'))
  handle('db:get', (t, id) => db.get(t, id))
  // Dati provenienti da servizi esterni: modificabili solo tramite gli appositi canali (collegamento locale a una pratica).
  const PROTETTE = new Set(['calendari', 'eventi_esterni'])
  handle('db:save', (t, obj) => {
    if (PROTETTE.has(t)) throw new Error('Questi dati si gestiscono dalle Impostazioni → Integrazioni')
    if (t === 'documenti') {
      if (!obj?.id || !db.get('documenti', obj.id)) throw new Error('Collega il documento con la finestra di scelta file')
      obj = { id: obj.id, ...(obj.nome !== undefined ? { nome: obj.nome } : {}), ...(obj.categoria !== undefined ? { categoria: obj.categoria } : {}) }
    }
    if (t === 'parcelle' && (obj?.importazione || (obj?.id && db.get(t, obj.id)?.importazione))) throw new Error('Modifica il documento importato dal suo editor per conservarne la verifica')
    if (t === 'parcelle' && obj?.id && obj.tipo && obj.tipo !== db.get(t, obj.id)?.tipo) throw new Error('Cambia il tipo dall’editor del documento')
    const r = db.save(t, obj)
    changed(t)
    return r
  })
  handle('db:delete', (t, id) => {
    if (PROTETTE.has(t)) throw new Error('Questi dati si gestiscono dalle Impostazioni → Integrazioni')
    if (t === 'pratiche') return deletePratica(id)
    if (t === 'documenti') return deleteDocumento(id)
    db.remove(t, id)
    changed(t)
    if (t === 'anagrafica') changed('pratiche', 'parcelle')
    return true
  })
  // Eliminazione con «Annulla»: la riga viene tolta e restituita al chiamante, che per qualche secondo può chiederne il ripristino.
  // Solo per dati leggeri e senza file dell'utente: un documento collegato perde il collegamento, il file non si tocca mai.
  const undoSnapshots = new Map()
  const ANNULLABILI = new Set(['scadenze', 'todos', 'note', 'link', 'ore', 'spese', 'documenti'])
  handle('db:deleteUndo', (t, id) => {
    if (!ANNULLABILI.has(t)) throw new Error('Eliminazione annullabile non prevista per questi dati')
    const riga = db.get(t, id); if (!riga) return null
    if (t === 'documenti' && !riga.percorso) throw new Error('Questo documento è una copia interna dell\'app: usa l\'eliminazione con conferma')
    const docIds = t === 'ore' ? db.list('documenti', { ora_id: id }).map((d) => d.id) : []
    db.remove(t, id)
    changed(t, 'cronologia', ...(docIds.length ? ['documenti'] : []))
    const token = require('node:crypto').randomUUID()
    undoSnapshots.set(token, { archive: db.getDb(), t, riga, docIds, expires: Date.now() + 30000 })
    for (const [key, snapshot] of undoSnapshots) if (snapshot.expires < Date.now() || snapshot.archive !== db.getDb()) undoSnapshots.delete(key)
    return { t, riga, docIds, token }
  })
  handle('db:undo', (request) => {
    const snap = undoSnapshots.get(request?.token)
    if (!snap || snap.expires < Date.now() || snap.archive !== db.getDb()) { undoSnapshots.delete(request?.token); throw new Error('L’annullamento non è più disponibile') }
    if (!snap || !ANNULLABILI.has(snap.t) || !snap.riga || !Number.isInteger(snap.riga.id)) throw new Error('Nulla da annullare')
    const r = db.transaction(() => {
      const nuova = db.ripristina(snap.t, snap.riga)
      for (const d of snap.docIds || []) if (db.get('documenti', d)) db.save('documenti', { id: d, ora_id: snap.riga.id })
      return nuova
    })
    undoSnapshots.delete(request.token)
    changed(snap.t, 'cronologia', 'documenti')
    return r
  })
  handle('db:search', async (q) => {
    try { await doctext.indicizzaPendentiAsync(4) } catch { /* l'indicizzazione non deve bloccare la ricerca */ }
    const base = db.searchAll(q), visti = new Set(base.filter((h) => h.kind === 'documento').map((h) => h.id))
    return [...base, ...doctext.cercaNeiDocumenti(q).filter((h) => !visti.has(h.id))]
  })

  function deletePratica(id) {
    const dir = praticaDir(id)
    if (!db.get('pratiche', id)) throw new Error('Pratica non trovata')
    db.remove('pratiche', id)
    fs.rmSync(dir, { recursive: true, force: true })
    changed('pratiche', 'scadenze', 'todos', 'note', 'documenti', 'link', 'ore', 'spese', 'parcelle', 'notifiche')
    return true
  }
  function deleteDocumento(id) {
    const d = db.get('documenti', id)
    if (d) {
      if (!d.percorso) { try { fs.rmSync(docPath(d.file), { force: true }) } catch { /* file già rimosso */ } } // il file collegato dell'utente non si tocca mai
      db.remove('documenti', id)
      changed('documenti')
    }
    return true
  }


  handle('settings:get', () => db.getSettings())
  handle('settings:set', (obj) => {
    const patch = { ...obj }; delete patch.backup_cifrato // si gestisce solo dai canali dedicati alla chiave
    const r = db.setSettings(patch)
    onSettings(r)
    changed('settings', 'pratiche')
    return r
  })


  handle('pratica:nextNumero', () => db.nextPraticaNumero())
  handle('parcella:get', (id) => db.getParcella(id))
  handle('parcella:save', (obj) => {
    const r = db.saveParcella(obj)
    changed('parcelle', 'voci_parcella', 'ore', 'spese')
    return r
  })
  handle('parcella:next', (anno, tipo) => db.nextParcellaNumero(anno, tipo))
  handle('todos:reorder', (ids) => { db.reorderTodos(ids); changed('todos'); return true })
}
