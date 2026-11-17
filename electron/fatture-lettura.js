'use strict'
// Lettura delle fatture elettroniche (FatturaPA 1.2) esportate dal servizio di fatturazione dell'utente: file .xml,
// file firmati .xml.p7m (anche in base64) e archivi .zip che li contengono. Sola lettura: nessun file viene modificato
// e nulla viene inviato al servizio. Si estraggono i dati che servono al budget: chi, quando, quanto, IVA, ritenuta,
// cassa, bollo e scadenze di pagamento.
const crypto = require('node:crypto')
const { leggiZip } = require('./zip')

const MAX_FILE = 30 * 1024 * 1024

// ---------------------------------------------------------------- busta firmata (CAdES, .p7m)
/** Contenuto di un .p7m: si percorre la struttura DER e si riuniscono i pezzi di OCTET STRING (anche spezzati in blocchi). */
function contenutoP7m(buf) {
  let candidati = []
  const leggi = (pos, fine, prof) => {
    while (pos < fine) {
      if (prof > 40) throw new Error('Firma non leggibile')
      const tag = buf[pos], costruito = (tag & 0x20) !== 0
      let p = pos + 1
      if (p >= buf.length) throw new Error('Firma troncata')
      let len = buf[p++], indefinita = false
      if (len === 0x80) indefinita = true
      else if (len & 0x80) { const n = len & 0x7f; if (n > 4) throw new Error('Firma non leggibile'); len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[p++] }
      if (tag === 0 && !indefinita && len === 0) return pos + 2 // fine dei contenuti a lunghezza indefinita
      if (indefinita) {
        const dopo = leggi(p, fine, prof + 1)
        if (tag === 0x24) candidati.push({ inizio: p, fine: dopo, costruito: true })
        pos = dopo; continue
      }
      if (p + len > buf.length) throw new Error('Firma troncata')
      if (tag === 0x04) candidati.push({ inizio: p, fine: p + len })
      else if (tag === 0x24) candidati.push({ inizio: p, fine: p + len, costruito: true })
      if (costruito) leggi(p, p + len, prof + 1)
      pos = p + len
    }
    return pos
  }
  leggi(0, buf.length, 0)
  // un OCTET STRING costruito: i suoi pezzi primitivi, nell'ordine, formano il documento
  const pezzi = (c) => candidati.filter((x) => !x.costruito && x.inizio >= c.inizio && x.fine <= c.fine).map((x) => buf.subarray(x.inizio, x.fine))
  const testi = candidati.map((c) => (c.costruito ? Buffer.concat(pezzi(c)) : buf.subarray(c.inizio, c.fine)))
  // il pezzo più lungo che contiene la fattura: i singoli blocchi di un contenuto spezzato ne hanno solo una parte
  const doc = testi.filter((t) => t.includes('FatturaElettronica')).sort((a, b) => b.length - a.length)[0]
  candidati = []
  if (!doc) throw new Error('Nessuna fattura dentro il file firmato')
  return doc
}

/** Il file così com'è (XML), oppure il contenuto della busta firmata, anche se salvata in base64. */
function xmlDa(buf) {
  if (buf.length > MAX_FILE) throw new Error('File troppo grande')
  let b = buf
  const inizio = b.subarray(0, 64).toString('latin1').trimStart()
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(b.subarray(0, Math.min(b.length, 4096)).toString('latin1')) && !inizio.startsWith('<')) {
    const decodificato = Buffer.from(b.toString('latin1').replace(/\s+/g, ''), 'base64')
    if (decodificato.length > 16) b = decodificato
  }
  if (b[0] === 0x30) b = contenutoP7m(b)
  const t = b.toString('utf8').replace(/^﻿/, '')
  if (!/FatturaElettronica/.test(t)) throw new Error('Non è una fattura elettronica')
  return t
}

// ---------------------------------------------------------------- XML FatturaPA
const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodifica = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (t, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITA[e] ?? t)
/** Tutti i blocchi <Nome>…</Nome> (con o senza prefisso dello spazio dei nomi) dentro `s`. */
const blocchi = (s, nome) => [...s.matchAll(new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`, 'g'))].map((m) => m[1])
const uno = (s, nome) => { const b = blocchi(s || '', nome)[0]; return b === undefined ? '' : decodifica(b).trim() }
const num = (s) => { const n = Number(String(s || '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const r2 = (n) => Math.round(n * 100) / 100

function soggetto(s) {
  const anag = blocchi(s, 'Anagrafica')[0] || ''
  const nome = uno(anag, 'Denominazione') || [uno(anag, 'Nome'), uno(anag, 'Cognome')].filter(Boolean).join(' ')
  const idIva = blocchi(s, 'IdFiscaleIVA')[0] || ''
  return { nome, piva: uno(idIva, 'IdCodice'), paese: uno(idIva, 'IdPaese'), cf: uno(s, 'CodiceFiscale') }
}

/**
 * Le fatture di un file FatturaPA (un file può contenerne più di una, una per «body»).
 * `mieiCodici`: partita IVA e codice fiscale di chi usa TIO, per capire se la fattura è emessa o ricevuta.
 */
function leggiFatture(xml, mieiCodici = []) {
  const header = blocchi(xml, 'FatturaElettronicaHeader')[0] || ''
  const cedente = soggetto(blocchi(header, 'CedentePrestatore')[0] || ''), committente = soggetto(blocchi(header, 'CessionarioCommittente')[0] || '')
  const miei = new Set(mieiCodici.map((c) => String(c || '').replace(/\s+/g, '').toUpperCase().replace(/^IT(?=\d{11}$)/, '')).filter(Boolean))
  const mio = (x) => miei.has(x.piva.toUpperCase()) || miei.has(x.cf.toUpperCase())
  // senza i propri codici si considera emessa la fattura in cui non si è il cliente
  const verso = mio(cedente) ? 'emessa' : mio(committente) ? 'ricevuta' : miei.size ? 'ricevuta' : 'emessa'
  const controparte = verso === 'emessa' ? committente : cedente
  return blocchi(xml, 'FatturaElettronicaBody').map((body) => {
    const generali = blocchi(body, 'DatiGeneraliDocumento')[0] || ''
    const tipo = uno(generali, 'TipoDocumento') || 'TD01'
    const segno = tipo === 'TD04' ? -1 : 1 // nota di credito: importi in negativo
    const riepiloghi = blocchi(body, 'DatiRiepilogo')
    const imponibile = r2(riepiloghi.reduce((s, r) => s + num(uno(r, 'ImponibileImporto')), 0))
    const iva = r2(riepiloghi.reduce((s, r) => s + num(uno(r, 'Imposta')), 0))
    const ritenuta = r2(blocchi(generali, 'DatiRitenuta').reduce((s, r) => s + num(uno(r, 'ImportoRitenuta')), 0))
    const cassa = r2(blocchi(generali, 'DatiCassaPrevidenziale').reduce((s, r) => s + num(uno(r, 'ImportoContributoCassa')), 0))
    const bollo = r2(num(uno(blocchi(generali, 'DatiBollo')[0] || '', 'ImportoBollo')))
    const dichiarato = uno(generali, 'ImportoTotaleDocumento')
    const totale = r2(dichiarato ? num(dichiarato) : imponibile + iva + bollo)
    const dettagli = blocchi(body, 'DettaglioPagamento')
    const scadenze = dettagli.map((d) => ({ data: uno(d, 'DataScadenzaPagamento') || null, importo: r2(num(uno(d, 'ImportoPagamento'))) })).filter((d) => d.data || d.importo)
    const netto = r2(scadenze.length ? scadenze.reduce((s, d) => s + d.importo, 0) : totale - ritenuta)
    const descrizione = blocchi(body, 'DettaglioLinee').map((l) => uno(l, 'Descrizione')).filter(Boolean).slice(0, 3).join(' · ').slice(0, 300)
    return {
      verso, tipo, numero: uno(generali, 'Numero'), data: uno(generali, 'Data').slice(0, 10),
      controparte: controparte.nome, piva: controparte.piva, cf: controparte.cf, descrizione,
      imponibile: segno * Math.abs(imponibile), iva: segno * Math.abs(iva), ritenuta: segno * Math.abs(ritenuta), cassa: segno * Math.abs(cassa), bollo,
      totale: segno * Math.abs(totale), netto: segno * Math.abs(netto),
      scadenza: scadenze.map((d) => d.data).filter(Boolean).sort().at(-1) || null,
    }
  }).filter((f) => f.numero && /^\d{4}-\d{2}-\d{2}$/.test(f.data))
}

/** Le fatture contenute in un file (.xml, .p7m o .zip); ogni fattura porta l'impronta del suo file per riconoscerla. */
function leggiFile(nome, buf, mieiCodici) {
  if (/\.zip$/i.test(nome)) {
    const z = leggiZip(buf), out = []
    for (const voce of z.nomi.filter((n) => /\.(xml|p7m)$/i.test(n) && !/(^|\/)__MACOSX\//.test(n)).slice(0, 5000)) {
      try { out.push(...leggiFile(voce, z.leggi(voce), mieiCodici)) } catch { /* file dell'archivio che non è una fattura: saltato */ }
    }
    return out
  }
  const xml = xmlDa(buf), impronta = crypto.createHash('sha256').update(xml).digest('hex')
  return leggiFatture(xml, mieiCodici).map((f, i) => ({ ...f, impronta: i ? `${impronta}-${i}` : impronta, file: nome.split(/[\\/]/).pop() }))
}

module.exports = { leggiFile, leggiFatture, xmlDa, contenutoP7m }
