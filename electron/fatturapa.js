'use strict'
// Fattura elettronica in formato FatturaPA tra privati (FPR12, schema v1.2.3, specifiche tecniche 1.9.1 dell'Agenzia delle
// Entrate). TIO prepara il file XML a partire da un documento dell'archivio: l'invio allo SdI resta al canale dell'utente
// (area Fatture e Corrispettivi, intermediario o commercialista), che appone l'eventuale firma e restituisce le ricevute.
//
// Regole seguite, oltre allo schema:
// - righe: compensi, spese generali e spese imponibili con l'aliquota IVA del documento (e «Ritenuta SI» se c'è ritenuta);
//   spese anticipate escluse dall'IVA (art. 15 DPR 633/72) e rimborso del bollo con natura N1;
// - contributo previdenziale (CPA, rivalsa INPS…) in DatiCassaPrevidenziale, dentro l'imponibile del riepilogo;
// - un riepilogo per ogni aliquota o natura, con imponibile e imposta coerenti con le righe (come controlla lo SdI);
// - testi limitati ai caratteri latini ammessi dallo schema: «€», apostrofi e virgolette tipografiche vengono convertiti.

const TIPI_DOCUMENTO = { TD01: 'Fattura', TD06: 'Parcella', TD04: 'Nota di credito' }
const REGIMI = {
  RF01: 'Ordinario', RF02: 'Contribuenti minimi', RF04: 'Agricoltura e pesca', RF05: 'Vendita sali e tabacchi', RF06: 'Commercio fiammiferi', RF07: 'Editoria',
  RF08: 'Gestione servizi telefonia pubblica', RF09: 'Rivendita documenti di trasporto pubblico', RF10: 'Intrattenimenti e giochi', RF11: 'Agenzie di viaggi e turismo',
  RF12: 'Agriturismo', RF13: 'Vendite a domicilio', RF14: 'Rivendita beni usati e oggetti d’arte', RF15: 'Agenzie di vendite all’asta', RF16: 'IVA per cassa P.A.',
  RF17: 'IVA per cassa', RF18: 'Altro', RF19: 'Forfettario', RF20: 'Franchigia IVA transfrontaliera',
}
const CASSE = {
  TC01: 'Cassa nazionale previdenza e assistenza avvocati e procuratori legali', TC02: 'Cassa previdenza dottori commercialisti', TC03: 'Cassa previdenza e assistenza geometri',
  TC04: 'Cassa nazionale previdenza e assistenza ingegneri e architetti liberi professionisti', TC05: 'Cassa nazionale del notariato', TC06: 'Cassa nazionale previdenza e assistenza ragionieri e periti commerciali',
  TC07: 'Ente nazionale assistenza agenti e rappresentanti di commercio (ENASARCO)', TC08: 'Ente nazionale previdenza e assistenza consulenti del lavoro (ENPACL)', TC09: 'Ente nazionale previdenza e assistenza medici (ENPAM)',
  TC10: 'Ente nazionale previdenza e assistenza farmacisti (ENPAF)', TC11: 'Ente nazionale previdenza e assistenza veterinari (ENPAV)', TC12: 'Ente nazionale previdenza e assistenza impiegati dell’agricoltura (ENPAIA)',
  TC13: 'Fondo previdenza impiegati imprese di spedizione e agenzie marittime', TC14: 'Istituto nazionale previdenza giornalisti italiani (INPGI)', TC15: 'Opera nazionale assistenza orfani sanitari italiani (ONAOSI)',
  TC16: 'Cassa autonoma assistenza integrativa giornalisti italiani (CASAGIT)', TC17: 'Ente previdenza periti industriali e periti industriali laureati (EPPI)', TC18: 'Ente previdenza e assistenza pluricategoriale (EPAP)',
  TC19: 'Ente nazionale previdenza e assistenza biologi (ENPAB)', TC20: 'Ente nazionale previdenza e assistenza professione infermieristica (ENPAPI)', TC21: 'Ente nazionale previdenza e assistenza psicologi (ENPAP)',
  TC22: 'INPS (gestione separata, rivalsa 4%)',
}
const NATURE = { 'N2.1': 'Non soggette art. 7-7septies DPR 633/72', 'N2.2': 'Non soggette - altri casi', 'N3.6': 'Non imponibili - altre operazioni', N4: 'Esenti' }
const RIFERIMENTI = {
  N1: 'Escluse art. 15 DPR 633/72',
  'N2.2': 'Operazione in franchigia da IVA ai sensi dell\'art. 1, commi 54-89, L. 190/2014',
}

// caratteri ammessi dallo schema: latino di base e supplemento Latin-1
const SOSTITUZIONI = { '€': 'EUR', '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"', '–': '-', '—': '-', '…': '...', '•': '-', ' ': ' ', 'œ': 'oe', 'Œ': 'OE', '™': '(TM)', 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', 'Ŧ': 'T', 'ŧ': 't' }
function latino(s, max) {
  let t = [...String(s ?? '').normalize('NFC')].map((c) => SOSTITUZIONI[c] ?? c).join('')
  t = [...t].map((c) => (c.codePointAt(0) <= 0xff ? c : c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\xff]/g, '?'))).join('')
  t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  return max ? t.slice(0, max) : t
}
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const el = (nome, valore) => (valore === undefined || valore === null || valore === '' ? '' : `<${nome}>${xml(String(valore))}</${nome}>`)
const testo = (nome, v, max) => { const t = latino(v, max); return t ? el(nome, t) : '' }
const r2 = (n) => Math.round((Number(n) || 0) * 100 + Number.EPSILON * 100) / 100
const imp = (n) => r2(n).toFixed(2)
const prezzo = (n) => { const v = Math.round((Number(n) || 0) * 1e6) / 1e6; const s = v.toFixed(6).replace(/0{1,4}$/, ''); return /\.\d$/.test(s) ? s + '0' : s }
const qta = (n) => (Number(n) || 0).toFixed(2)

/** Sede da campi separati o da «CAP Città (PR)». */
function sede({ indirizzo, cap, citta, provincia, capCitta }) {
  let c = cap, comune = citta, pr = provincia
  if (capCitta && (!c || !comune)) {
    const m = String(capCitta).match(/^\s*(\d{5})?\s*[-–]?\s*(.*?)\s*(?:\(([A-Za-z]{2})\))?\s*$/)
    if (m) { c ||= m[1]; comune ||= m[2]; pr ||= m[3] }
  }
  return { indirizzo: latino(indirizzo, 60), cap: String(c || '').trim(), comune: latino(comune, 60), provincia: String(pr || '').trim().toUpperCase() }
}
const sedeXml = (s) => `<Sede>${el('Indirizzo', s.indirizzo)}${el('CAP', s.cap)}${el('Comune', s.comune)}${/^[A-Z]{2}$/.test(s.provincia) ? el('Provincia', s.provincia) : ''}<Nazione>IT</Nazione></Sede>`
function anagraficaXml(a) {
  if (a.nome && a.cognome) return `<Anagrafica>${testo('Nome', a.nome, 60)}${testo('Cognome', a.cognome, 60)}</Anagrafica>`
  return `<Anagrafica>${testo('Denominazione', a.denominazione, 80)}</Anagrafica>`
}
const pulisciCodice = (s) => String(s || '').replace(/\s+/g, '').toUpperCase()
const pivaPulita = (s) => pulisciCodice(s).replace(/^IT/, '')

/** Progressivo del file (5 caratteri alfanumerici) dal numero del documento: stesso documento, stesso nome di file. */
function progressivo(p) {
  const n = ((Number(p.anno) || 2000) % 100) * 100000 + (Number(p.progressivo) || 0)
  return n.toString(36).toUpperCase().padStart(5, '0').slice(-5)
}

/**
 * dati = { parcella, voci, cliente, studio, opzioni }
 * opzioni = { tipoDocumento, regime, tipoCassa, natura, codiceDestinatario, pecDestinatario, tipoRitenuta, causaleRitenuta,
 *             cedente: { denominazione | nome, cognome }, cessionario: { denominazione | nome, cognome }, scadenza, iban }
 * Restituisce { xml, nomeFile, errori: [], avvisi: [] }: con errori il file non va prodotto.
 */
function genera({ parcella: p, voci = [], cliente, studio = {}, opzioni: o = {}, collegata = null }) {
  const errori = [], avvisi = []
  if (!p) throw new Error('Documento non trovato')
  if (p.tipo === 'preventivo' || p.tipo === 'proforma') errori.push('Preventivi e note pro forma non sono fatture: crea prima il documento di vendita.')
  if (p.stato === 'annullata') errori.push('Il documento è annullato.')
  // la nota di credito è sempre TD04 e richiama la fattura che storna; una fattura non può essere TD04
  const notaCredito = p.tipo === 'nota_credito'
  const tipoDoc = notaCredito ? 'TD04' : TIPI_DOCUMENTO[o.tipoDocumento] && o.tipoDocumento !== 'TD04' ? o.tipoDocumento : 'TD01'
  if (notaCredito && !(collegata?.numero && /^\d{4}-\d{2}-\d{2}$/.test(collegata?.data || ''))) errori.push('La fattura stornata da questa nota di credito non è più nell’archivio: serve il suo numero e la sua data.')
  const regime = REGIMI[o.regime] ? o.regime : 'RF01'
  const iva = r2(p.iva_perc), rit = r2(p.rit_perc), cassa = r2(p.cpa_perc)

  // cedente (chi emette)
  const piva = pivaPulita(studio.piva), cf = pulisciCodice(studio.cf)
  if (!/^\d{11}$/.test(piva)) errori.push('Partita IVA dell’attività mancante o non valida (Impostazioni › La tua attività).')
  if (cf && !/^[A-Z0-9]{11,16}$/.test(cf)) errori.push('Codice fiscale dell’attività non valido.')
  const sCed = sede({ indirizzo: studio.indirizzo, capCitta: studio.cap_citta })
  if (!sCed.indirizzo || !/^\d{5}$/.test(sCed.cap) || !sCed.comune) errori.push('Indirizzo dell’attività incompleto: servono via, CAP e comune (es. «41121 Modena (MO)»).')
  const ced = o.cedente?.nome && o.cedente?.cognome ? o.cedente : { denominazione: o.cedente?.denominazione || studio.intestazione || studio.nome }
  if (!ced.denominazione && !(ced.nome && ced.cognome)) errori.push('Nome dell’attività mancante.')

  // cessionario (cliente)
  if (!cliente) errori.push('Il documento non ha un cliente.')
  const c = cliente || {}
  const cPiva = pivaPulita(c.partita_iva), cCf = pulisciCodice(c.codice_fiscale)
  if (cliente && !/^\d{11}$/.test(cPiva) && !/^[A-Z0-9]{11,16}$/.test(cCf)) errori.push(`Al cliente «${c.denominazione}» manca il codice fiscale o la partita IVA.`)
  const sCes = sede({ indirizzo: c.indirizzo, cap: c.cap, citta: c.citta, provincia: c.provincia })
  if (cliente && (!sCes.indirizzo || !/^\d{5}$/.test(sCes.cap) || !sCes.comune)) errori.push(`Indirizzo del cliente «${c.denominazione}» incompleto: servono via, CAP e comune (Anagrafica).`)
  const ces = o.cessionario?.nome && o.cessionario?.cognome ? o.cessionario : { denominazione: o.cessionario?.denominazione || c.denominazione }

  // destinatario: codice SdI, oppure 0000000 con la PEC, oppure 0000000 da solo (privato: la fattura arriva nell'area riservata)
  let codice = pulisciCodice(o.codiceDestinatario) || '0000000'
  if (!/^[A-Z0-9]{7}$/.test(codice)) errori.push('Il codice destinatario deve avere 7 caratteri (lettere maiuscole e numeri).')
  const pec = String(o.pecDestinatario || '').trim()
  if (pec && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pec)) errori.push('PEC del destinatario non valida.')
  if (codice === '0000000' && !pec && /^\d{11}$/.test(cPiva)) avvisi.push('Il cliente ha la partita IVA ma non hai indicato codice destinatario né PEC: la fattura sarà disponibile solo nella sua area riservata.')

  // righe del documento
  const forfettario = regime === 'RF19' || regime === 'RF02'
  const natura = iva === 0 ? (NATURE[o.natura] ? o.natura : forfettario ? 'N2.2' : null) : null
  if (iva === 0 && !natura) errori.push('Senza IVA serve la natura dell’operazione (per esempio N2.2 per il regime forfettario).')
  if (forfettario && iva > 0) errori.push('Nel regime forfettario o dei minimi l’IVA non si applica: imposta l’aliquota a 0 nel documento.')
  const conRitenuta = rit > 0 && r2(p.ritenuta) > 0
  const righe = []
  const riga = (descrizione, quantita, unitario, totale, imponibile) => righe.push({ descrizione: latino(descrizione, 1000) || 'Prestazione', quantita, unitario, totale: r2(totale), imponibile })
  // nell'ordine della parcella: compensi, spese generali, spese imponibili, spese escluse dall'IVA, bollo
  const voce = (tipo) => { for (const v of voci.filter((x) => (x.tipo || 'compenso') === tipo)) { const q = Number(v.quantita) || 0, u = Number(v.importo) || 0; if (q && u) riga(v.descrizione, q, u, q * u, tipo !== 'spesa_esente') } }
  voce('compenso')
  if (r2(p.spese_generali)) riga(`Spese generali ${r2(p.sg_perc).toString().replace('.', ',')}% sui compensi`, 1, p.spese_generali, p.spese_generali, true)
  voce('spesa_imponibile'); voce('spesa_esente')
  if (r2(p.bollo)) riga('Rimborso imposta di bollo', 1, p.bollo, p.bollo, false)
  if (!righe.length) errori.push('Il documento non ha voci con importo.')

  // coerenza con il documento salvato: le righe devono dare gli stessi imponibili
  const imponibileRighe = r2(righe.filter((x) => x.imponibile).reduce((s, x) => s + x.totale, 0))
  const esclusoRighe = r2(righe.filter((x) => !x.imponibile).reduce((s, x) => s + x.totale, 0))
  const contributo = r2(p.cpa)
  if (Math.abs(imponibileRighe + contributo - r2(p.imponibile)) > 0.01) errori.push(`Le voci non corrispondono all’imponibile del documento (${imp(imponibileRighe + contributo)} invece di ${imp(p.imponibile)}): riapri e salva il documento.`)
  if (Math.abs(esclusoRighe - r2(Number(p.spese_esenti) + Number(p.bollo))) > 0.01) errori.push('Le spese escluse dall’IVA non corrispondono al documento: riapri e salva il documento.')

  const tipoCassa = contributo ? (CASSE[o.tipoCassa] ? o.tipoCassa : null) : null
  if (contributo && !tipoCassa) errori.push('Indica il tipo di cassa previdenziale del contributo (per esempio TC01 per gli avvocati, TC22 per la rivalsa INPS).')
  const aliq = imp(iva)
  const lineeXml = righe.map((x, i) => `<DettaglioLinee><NumeroLinea>${i + 1}</NumeroLinea>${el('Descrizione', x.descrizione)}${x.quantita !== 1 ? el('Quantita', qta(x.quantita)) : ''}<PrezzoUnitario>${prezzo(x.unitario)}</PrezzoUnitario><PrezzoTotale>${imp(x.totale)}</PrezzoTotale>`
    + (x.imponibile ? `<AliquotaIVA>${aliq}</AliquotaIVA>${conRitenuta ? '<Ritenuta>SI</Ritenuta>' : ''}${natura ? el('Natura', natura) : ''}` : '<AliquotaIVA>0.00</AliquotaIVA><Natura>N1</Natura>') + '</DettaglioLinee>').join('')

  const riepiloghi = []
  if (imponibileRighe || contributo) riepiloghi.push(`<DatiRiepilogo><AliquotaIVA>${aliq}</AliquotaIVA>${natura ? el('Natura', natura) : ''}<ImponibileImporto>${imp(imponibileRighe + contributo)}</ImponibileImporto><Imposta>${imp(natura ? 0 : p.iva)}</Imposta>${natura ? (RIFERIMENTI[natura] ? el('RiferimentoNormativo', RIFERIMENTI[natura]) : el('RiferimentoNormativo', NATURE[natura])) : '<EsigibilitaIVA>I</EsigibilitaIVA>'}</DatiRiepilogo>`)
  if (esclusoRighe) riepiloghi.push(`<DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>N1</Natura><ImponibileImporto>${imp(esclusoRighe)}</ImponibileImporto><Imposta>0.00</Imposta>${el('RiferimentoNormativo', RIFERIMENTI.N1)}</DatiRiepilogo>`)
  if (!natura && Math.abs(r2(imponibileRighe + contributo) * iva / 100 - r2(p.iva)) > 0.01) errori.push('L’IVA del documento non corrisponde all’imponibile: riapri e salva il documento.')

  const tipoRitenuta = o.tipoRitenuta === 'RT02' ? 'RT02' : 'RT01'
  const datiRitenuta = conRitenuta ? `<DatiRitenuta><TipoRitenuta>${tipoRitenuta}</TipoRitenuta><ImportoRitenuta>${imp(p.ritenuta)}</ImportoRitenuta><AliquotaRitenuta>${imp(rit)}</AliquotaRitenuta><CausalePagamento>${/^[A-Z]{1,2}\d?$/.test(o.causaleRitenuta || '') ? o.causaleRitenuta : 'A'}</CausalePagamento></DatiRitenuta>` : ''
  const datiBollo = r2(p.bollo) ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${imp(p.bollo)}</ImportoBollo></DatiBollo>` : ''
  const datiCassa = contributo ? `<DatiCassaPrevidenziale><TipoCassa>${tipoCassa || 'TC01'}</TipoCassa><AlCassa>${imp(cassa)}</AlCassa><ImportoContributoCassa>${imp(contributo)}</ImportoContributoCassa><ImponibileCassa>${imp(imponibileRighe)}</ImponibileCassa><AliquotaIVA>${aliq}</AliquotaIVA>${conRitenuta && p.contributo_ritenuta ? '<Ritenuta>SI</Ritenuta>' : ''}${natura ? el('Natura', natura) : ''}</DatiCassaPrevidenziale>` : ''
  const causale = latino(p.oggetto, 200)

  const iban = pulisciCodice(o.iban ?? studio.iban)
  const ibanOk = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)
  if (iban && !ibanOk) avvisi.push('L’IBAN dell’attività non ha un formato valido: non viene indicato nel file.')
  const scadenza = /^\d{4}-\d{2}-\d{2}$/.test(o.scadenza || p.scadenza_pagamento || '') ? (o.scadenza || p.scadenza_pagamento) : ''
  const pagamento = notaCredito ? '' : `<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento>${el('DataScadenzaPagamento', scadenza)}<ImportoPagamento>${imp(p.netto)}</ImportoPagamento>${ibanOk ? el('IBAN', iban) : ''}</DettaglioPagamento></DatiPagamento>`

  const numero = latino(p.numero, 20)
  if (!numero || !/\d/.test(numero)) errori.push('Il numero del documento deve contenere almeno una cifra.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || '')) errori.push('Data del documento non valida.')
  const prog = progressivo(p)
  const idTrasm = cf || piva
  const corpo = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 Schema_VFPR12_v1.2.3.xsd">
<FatturaElettronicaHeader>
<DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese>${el('IdCodice', idTrasm)}</IdTrasmittente><ProgressivoInvio>${prog}</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>${codice}</CodiceDestinatario>${pec ? el('PECDestinatario', latino(pec, 256)) : ''}</DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese>${el('IdCodice', piva)}</IdFiscaleIVA>${cf ? el('CodiceFiscale', cf) : ''}${anagraficaXml(ced)}<RegimeFiscale>${regime}</RegimeFiscale></DatiAnagrafici>${sedeXml(sCed)}</CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici>${/^\d{11}$/.test(cPiva) ? `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cPiva}</IdCodice></IdFiscaleIVA>` : ''}${/^[A-Z0-9]{11,16}$/.test(cCf) ? el('CodiceFiscale', cCf) : ''}${anagraficaXml(ces)}</DatiAnagrafici>${sedeXml(sCes)}</CessionarioCommittente>
</FatturaElettronicaHeader>
<FatturaElettronicaBody>
<DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${tipoDoc}</TipoDocumento><Divisa>EUR</Divisa><Data>${p.data}</Data>${el('Numero', numero)}${datiRitenuta}${datiBollo}${datiCassa}<ImportoTotaleDocumento>${imp(p.totale)}</ImportoTotaleDocumento>${causale ? el('Causale', causale) : ''}</DatiGeneraliDocumento>${notaCredito && collegata?.numero ? `<DatiFattureCollegate>${el('IdDocumento', latino(collegata.numero, 20))}${el('Data', collegata.data)}</DatiFattureCollegate>` : ''}</DatiGenerali>
<DatiBeniServizi>${lineeXml}${riepiloghi.join('')}</DatiBeniServizi>
${pagamento}
</FatturaElettronicaBody>
</p:FatturaElettronica>
`
  return { xml: corpo, nomeFile: `IT${idTrasm}_${prog}.xml`, errori, avvisi }
}

module.exports = { genera, latino, progressivo, sede, TIPI_DOCUMENTO, REGIMI, CASSE, NATURE }
