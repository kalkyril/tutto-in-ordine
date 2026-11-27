'use strict'
// Operazioni locali composte: ciascuna scrittura economica avviene in transazione.
const db = require('./db'), v = require('./validation'), { primoLavorativo } = require('./giorni-lavorativi')
const cent = n => Math.round(Number(n) * 100)
const euro = n => cent(n) / 100
const testo = (s, required = false) => { const t = String(s ?? '').trim().slice(0, 2000); if (required && !t) throw new Error('Compila i campi obbligatori'); return t }
const giorno = (s, required = true) => { if (!s && !required) return null; v.date(s, 'data'); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Usa una data senza ora'); return s }
const ref = (table, id) => { if (!id) return null; const r = db.get(table, v.id(id)); if (!r) throw new Error('Elemento non trovato'); return r.id }
const importo = (n, zero = false) => { if (!Number.isFinite(Number(n)) || cent(n) < (zero ? 0 : 1) || cent(n)>1e12) throw new Error('Importo non valido'); return euro(n) }
const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
// mesi fra due scadenze (1.0.5: anche ogni 2 e ogni 6 mesi, per bollette e assicurazioni)
const MESI_FREQUENZA = { mensile: 1, bimestrale: 2, trimestrale: 3, semestrale: 6, annuale: 12 }
function successiva(data, frequenza, anchor) {
  const [y,m,d] = data.split('-').map(Number), n = new Date(Date.UTC(y,m-1,d))
  if (frequenza === 'settimanale') n.setUTCDate(n.getUTCDate()+7)
  else { n.setUTCDate(1); n.setUTCMonth(n.getUTCMonth()+(MESI_FREQUENZA[frequenza]||1)); const ultimo = new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth()+1,0)).getUTCDate(); n.setUTCDate(Math.min(anchor,ultimo)) }
  return n.toISOString().slice(0,10)
}
function generaRicorrenze(adesso = oggi()) {
  giorno(adesso)
  return db.transaction(() => {
    const sql = db.getDb(); let creati = 0
    for (const r of sql.prepare('SELECT * FROM ricorrenze WHERE attiva=1 AND prossima<=?').all(adesso)) {
      db.save('todos', { pratica_id:r.pratica_id, titolo:r.titolo, scadenza:r.lavorativo?primoLavorativo(r.prossima):r.prossima, priorita:1 })
      let prossima=r.prossima
      // Una sola attività arretrata per ricorrenza; evita centinaia di duplicati dopo una lunga pausa.
      for (let i=0; prossima<=adesso && i<10000; i++) prossima=successiva(prossima,r.frequenza,r.giorno)
      if (prossima<=adesso) throw new Error('Intervallo di ricorrenza troppo esteso')
      sql.prepare('UPDATE ricorrenze SET prossima=? WHERE id=?').run(prossima,r.id); creati++
    }
    return creati
  })
}
const FREQUENZE_COSTO = ['mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale']
const piuGiorni = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10) }
/**
 * Uscite ricorrenti: per ogni serie attiva crea la voce «da pagare» successiva quando mancano al massimo `anticipo` giorni
 * alla sua scadenza (e le eventuali arretrate, una per scadenza). La nuova voce copia l'ultima della serie (importo,
 * categoria, fornitore, pratica): cambiare l'importo dell'ultima vale per le prossime. Una voce eliminata non torna,
 * perché la serie ricorda l'ultima scadenza già creata.
 */
function estendiUsciteRicorrenti(adesso = oggi(), anticipo = 30) {
  giorno(adesso)
  const limite = piuGiorni(adesso, anticipo)
  return db.transaction(() => {
    const sql = db.getDb(); let creati = 0
    for (const s of sql.prepare("SELECT serie, MAX(ripeti_ultima) AS ultima, MAX(ripeti_giorno) AS g FROM costi WHERE ripeti IS NOT NULL AND serie IS NOT NULL GROUP BY serie").all()) {
      const modello = sql.prepare("SELECT * FROM costi WHERE serie=? AND ripeti IS NOT NULL ORDER BY COALESCE(scadenza,data) DESC, id DESC LIMIT 1").get(s.serie)
      if (!modello || !FREQUENZE_COSTO.includes(modello.ripeti)) continue
      let ultima = s.ultima || modello.scadenza || modello.data
      for (let i = 0; i < 240; i++) {
        const prossima = successiva(ultima, modello.ripeti, s.g || Number(ultima.slice(8)))
        if (prossima > limite || (modello.ripeti_fine && prossima > modello.ripeti_fine)) break
        sql.prepare('INSERT INTO costi(pratica_id,fornitore_id,data,descrizione,categoria,importo,scadenza,pagata,recuperabile,ripeti,serie,ripeti_giorno,ripeti_fine) VALUES(?,?,?,?,?,?,?,0,?,?,?,?,?)')
          .run(modello.pratica_id, modello.fornitore_id, prossima, modello.descrizione, modello.categoria, modello.importo, prossima, modello.recuperabile, modello.ripeti, s.serie, s.g || Number(ultima.slice(8)), modello.ripeti_fine || null)
        ultima = prossima; creati++
      }
      sql.prepare('UPDATE costi SET ripeti_ultima=? WHERE serie=?').run(ultima, s.serie)
    }
    return creati
  })
}
function esegui(azione, a = {}) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Dati non validi')
  const sql=db.getDb()
  if (azione==='leggi') return { pagamenti:sql.prepare('SELECT * FROM pagamenti ORDER BY data DESC,id DESC').all(), costi:sql.prepare('SELECT * FROM costi ORDER BY data DESC,id DESC').all(), ricorrenze:sql.prepare('SELECT * FROM ricorrenze ORDER BY prossima,id').all(), rate:sql.prepare('SELECT * FROM rate_documento ORDER BY parcella_id,data,id').all() }
  if (azione==='genera') return generaRicorrenze()
  return db.transaction(() => {
    if (azione==='rate') {
      // 1.0.4: piano di pagamento, sostituito per intero; un elenco vuoto lo toglie
      const p=db.getParcella(v.id(a.parcella_id)); if (!p || p.tipo!=='parcella' || p.stato==='annullata') throw new Error('Scegli un documento di vendita')
      if (!Array.isArray(a.rate) || a.rate.length>120) throw new Error('Rate non valide')
      const rate=a.rate.map((r)=>({data:giorno(r&&r.data),importo:importo(r&&r.importo)}))
      if (rate.some((r)=>!r.data)) throw new Error('Ogni rata ha bisogno della data')
      if (rate.reduce((s,r)=>s+cent(r.importo),0)>cent(p.netto)) throw new Error('Le rate superano il netto del documento')
      sql.prepare('DELETE FROM rate_documento WHERE parcella_id=?').run(p.id)
      const metti=sql.prepare('INSERT INTO rate_documento(parcella_id,data,importo) VALUES(?,?,?)')
      for (const r of rate.sort((x,y)=>x.data.localeCompare(y.data))) metti.run(p.id,r.data,r.importo)
      return rate.length
    }
    if (azione==='pagamento') {
      const p=db.getParcella(v.id(a.parcella_id)); if (!p || p.tipo!=='parcella' || !['emessa','pagata'].includes(p.stato)) throw new Error('Scegli un documento emesso')
      const richiesta=testo(a.richiesta,true); if (!/^[a-zA-Z0-9-]{8,100}$/.test(richiesta)) throw new Error('Richiesta non valida')
      const data=giorno(a.data), n=importo(a.importo), metodo=testo(a.metodo,true), note=testo(a.note)
      // 1.0.4: conto su cui arriva l'incasso (senza indicazione, il conto predefinito se c'è)
      const contoId=a.conto_id?(sql.prepare('SELECT id FROM conti WHERE id=?').get(v.id(a.conto_id))?.id??null):require('./budget').predefinito()
      const precedente=sql.prepare('SELECT * FROM pagamenti WHERE richiesta=?').get(richiesta)
      if (precedente) { if (precedente.parcella_id!==p.id || precedente.data!==data || cent(precedente.importo)!==cent(n) || precedente.metodo!==metodo || (precedente.note||'')!==note) throw new Error('Richiesta già usata con altri dati'); return p }
      if (!p.incassi_dettagliati) {
        const ricevuto=p.stato==='pagata'?p.netto:(p.incassato||0)
        if (ricevuto>0) sql.prepare('INSERT INTO pagamenti(parcella_id,data,importo,metodo,note) VALUES(?,?,?,?,?)').run(p.id,p.data_pagamento||null,ricevuto,'Precedente','Importo cumulativo delle versioni precedenti; data non specificata se assente')
      }
      const somma=cent(sql.prepare('SELECT COALESCE(SUM(importo),0) AS n FROM pagamenti WHERE parcella_id=?').get(p.id).n)+cent(n)
      if (somma>cent(p.netto)) throw new Error('Il pagamento supera il residuo del documento')
      sql.prepare('INSERT INTO pagamenti(parcella_id,data,importo,metodo,note,richiesta,conto_id) VALUES(?,?,?,?,?,?,?)').run(p.id,data,n,metodo,note,richiesta,contoId)
      db.aggiornaIncassi(p.id); return db.getParcella(p.id)
    }
    if (azione==='eliminaPagamento') {
      const r=sql.prepare('SELECT * FROM pagamenti WHERE id=?').get(v.id(a.id)); if (!r) throw new Error('Pagamento non trovato')
      sql.prepare('DELETE FROM pagamenti WHERE id=?').run(r.id); db.aggiornaIncassi(r.parcella_id); return true
    }
    if (azione==='costo') {
      const values=[ref('pratiche',a.pratica_id),ref('anagrafica',a.fornitore_id),giorno(a.data),testo(a.descrizione,true),testo(a.categoria,true),importo(a.importo,true),giorno(a.scadenza,false),a.pagata?1:0,a.recuperabile?1:0]
      // ripetizione: '' o null = una volta sola; altrimenti ogni mese, ogni tre mesi o ogni anno, a partire dalla scadenza
      const ripeti = a.ripeti ? String(a.ripeti) : null
      if (ripeti && !FREQUENZE_COSTO.includes(ripeti)) throw new Error('Frequenza non valida')
      const base = values[6] || values[2], giornoMese = Number(base.slice(8))
      // 1.0.5: ultima scadenza della serie (rate con una fine), facoltativa; non prima della voce stessa
      const fine = ripeti && a.ripeti_fine ? giorno(a.ripeti_fine) : null
      if (fine && fine < base) throw new Error('L’ultima scadenza non può venire prima di questa voce')
      let id
      // 1.0.4: quando e da quale conto è stata pagata (per il saldo reale dei conti): oggi e il conto predefinito, se non indicati
      const contoCosto = (x) => (a.conto_id ? sql.prepare('SELECT id FROM conti WHERE id=?').get(v.id(a.conto_id))?.id ?? null : x ?? require('./budget').predefinito())
      if (a.id) {
        id=v.id(a.id); const prima=sql.prepare('SELECT * FROM costi WHERE id=?').get(id); if (!prima) throw new Error('Costo non trovato')
        sql.prepare('UPDATE costi SET pratica_id=?,fornitore_id=?,data=?,descrizione=?,categoria=?,importo=?,scadenza=?,pagata=?,recuperabile=? WHERE id=?').run(...values,id)
        if (values[7]) sql.prepare('UPDATE costi SET pagata_il=?, conto_id=? WHERE id=?').run(a.pagata_il ? giorno(a.pagata_il) : prima.pagata_il || oggi(), contoCosto(prima.conto_id), id)
        else sql.prepare('UPDATE costi SET pagata_il=NULL WHERE id=?').run(id)
        if (a.ripeti !== undefined) {
          if (!ripeti && prima.serie) {
            // ripetizione interrotta da questa voce: le prossime ancora da pagare della serie vengono tolte
            const da = prima.scadenza || prima.data
            sql.prepare('DELETE FROM costi WHERE serie=? AND pagata=0 AND id<>? AND COALESCE(scadenza,data)>?').run(prima.serie, id, da)
            sql.prepare('UPDATE costi SET ripeti=NULL WHERE serie=?').run(prima.serie)
          } else if (ripeti) {
            const serie = prima.serie || id
            sql.prepare('UPDATE costi SET ripeti=?, serie=?, ripeti_giorno=COALESCE(ripeti_giorno, ?) WHERE id=? OR serie=?').run(ripeti, serie, giornoMese, id, serie)
            // l'ultima scadenza già creata si fissa solo quando la serie nasce: modificare una voce non deve far tornare quelle eliminate
            if (!prima.serie) sql.prepare('UPDATE costi SET ripeti_ultima=? WHERE serie=?').run(base, serie)
            if (a.ripeti_fine !== undefined) {
              sql.prepare('UPDATE costi SET ripeti_fine=? WHERE serie=?').run(fine, serie)
              // fine anticipata: le voci ancora da pagare oltre la nuova fine se ne vanno
              if (fine) sql.prepare('DELETE FROM costi WHERE serie=? AND pagata=0 AND id<>? AND COALESCE(scadenza,data)>?').run(serie, id, fine)
            }
          }
        }
      } else {
        id=Number(sql.prepare('INSERT INTO costi(pratica_id,fornitore_id,data,descrizione,categoria,importo,scadenza,pagata,recuperabile) VALUES(?,?,?,?,?,?,?,?,?)').run(...values).lastInsertRowid)
        if (values[7]) sql.prepare('UPDATE costi SET pagata_il=?, conto_id=? WHERE id=?').run(a.pagata_il ? giorno(a.pagata_il) : values[2], contoCosto(null), id)
        if (ripeti) sql.prepare('UPDATE costi SET ripeti=?, serie=?, ripeti_ultima=?, ripeti_giorno=?, ripeti_fine=? WHERE id=?').run(ripeti, id, base, giornoMese, fine, id)
      }
      if (ripeti) estendiUsciteRicorrenti()
      return id
    }
    if (azione==='ricorrenza') {
      if (!['settimanale','mensile','annuale'].includes(a.frequenza)) throw new Error('Frequenza non valida')
      const prossima=giorno(a.prossima), values=[ref('pratiche',a.pratica_id),testo(a.titolo,true),a.frequenza,prossima,Number(prossima.slice(8)),a.attiva===false||a.attiva===0?0:1,a.lavorativo?1:0]
      if (a.id) { const id=v.id(a.id), old=sql.prepare('SELECT * FROM ricorrenze WHERE id=?').get(id); if (!old) throw new Error('Ricorrenza non trovata'); if(old.prossima===prossima&&old.frequenza===a.frequenza)values[4]=old.giorno; sql.prepare('UPDATE ricorrenze SET pratica_id=?,titolo=?,frequenza=?,prossima=?,giorno=?,attiva=?,lavorativo=? WHERE id=?').run(...values,id); return id }
      return Number(sql.prepare('INSERT INTO ricorrenze(pratica_id,titolo,frequenza,prossima,giorno,attiva,lavorativo) VALUES(?,?,?,?,?,?,?)').run(...values).lastInsertRowid)
    }
    if (azione==='eliminaCosto' || azione==='eliminaRicorrenza') { const t=azione==='eliminaCosto'?'costi':'ricorrenze'; sql.prepare(`DELETE FROM ${t} WHERE id=?`).run(v.id(a.id)); return true }
    if (azione==='avvia' || azione==='converti') {
      const p=db.getParcella(v.id(a.id)); if (!p || p.tipo!=='preventivo' || p.esito_preventivo!=='accettato' || p.stato==='annullata') throw new Error('Accetta prima il preventivo')
      if (azione==='avvia') {
        if (p.pratica_id) return db.get('pratiche',p.pratica_id)
        const pr=db.save('pratiche',{numero:db.nextPraticaNumero(),titolo:p.oggetto||`Lavoro da preventivo ${p.numero}`,cliente_id:p.cliente_id,tipo:db.getSettings().attivita==='professionista'?'Incarico':'Commessa',stato:'In corso',data_apertura:oggi(),budget_importo:p.imponibile})
        db.save('parcelle',{id:p.id,pratica_id:pr.id}); return pr
      }
      if (!p.pratica_id) throw new Error('Avvia prima il lavoro o collega un incarico')
      const esistente=sql.prepare('SELECT id FROM parcelle WHERE origine_preventivo_id=?').get(p.id); if (esistente) return db.getParcella(esistente.id)
      const {id,anno,progressivo,numero,created_at,updated_at,...dati}=p
      return db.saveParcella({...dati,tipo:'parcella',stato:'bozza',data:oggi(),incassato:0,incassi_dettagliati:0,data_pagamento:null,origine_preventivo_id:p.id,importazione:null,esito_preventivo:'da_inviare',validita:null})
    }
    throw new Error('Operazione non riconosciuta')
  })
}
module.exports={esegui,generaRicorrenze,estendiUsciteRicorrenti,successiva}
