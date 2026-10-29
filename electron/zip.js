'use strict'
// Lettore minimo di archivi ZIP (serve per leggere i file .xlsx). Sola lettura.
const zlib = require('node:zlib')

function leggiZip(buf) {
  const MAX_ENTRY = 200 * 1024 * 1024, MAX_TOTAL = 256 * 1024 * 1024
  const check = (offset, length, end = buf.length) => { if (!Number.isSafeInteger(offset) || offset < 0 || length < 0 || offset + length > end) throw new Error('Archivio ZIP troncato') }
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) { eocd = i; break }
  if (eocd < 0) throw new Error('Il file non è un archivio valido (ZIP/XLSX)')
  const n = buf.readUInt16LE(eocd + 10), start = buf.readUInt32LE(eocd + 16), size = buf.readUInt32LE(eocd + 12)
  if (n > 10000 || buf.readUInt16LE(eocd + 4) || buf.readUInt16LE(eocd + 6) || n !== buf.readUInt16LE(eocd + 8)) throw new Error('Archivio ZIP non supportato')
  check(start, size, eocd)
  const end = start + size, voci = new Map(); let p = start, total = 0
  for (let k = 0; k < n; k++) {
    check(p, 46, end)
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Archivio danneggiato')
    const flags = buf.readUInt16LE(p + 8), metodo = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24)
    const lnome = buf.readUInt16LE(p + 28), lextra = buf.readUInt16LE(p + 30), lcomm = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42)
    check(p, 46 + lnome + lextra + lcomm, end)
    total += usize
    if (![0,8].includes(metodo) || flags & 1 || usize > MAX_ENTRY || total > MAX_TOTAL) throw new Error('Archivio ZIP non supportato o troppo grande')
    const nome = buf.toString('utf8', p + 46, p + 46 + lnome)
    if (voci.has(nome)) throw new Error('Voce ZIP duplicata')
    check(off, 30, start)
    if (buf.readUInt32LE(off) !== 0x04034b50 || buf.readUInt16LE(off + 8) !== metodo || buf.readUInt16LE(off + 6) & 1) throw new Error('Intestazione ZIP non valida')
    const localName = buf.readUInt16LE(off + 26), localExtra = buf.readUInt16LE(off + 28), data = off + 30 + localName + localExtra
    check(off, 30 + localName + localExtra, start); check(data, csize, start)
    if (buf.toString('utf8', off + 30, off + 30 + localName) !== nome) throw new Error('Nome ZIP non coerente')
    voci.set(nome, { metodo, csize, usize, data, crc })
    p += 46 + lnome + lextra + lcomm
  }
  if (p !== end) throw new Error('Indice ZIP non coerente')
  // Il budget vale anche per letture ripetute: un XML malevolo non può aggirarlo.
  let extracted = 0
  return {
    nomi: [...voci.keys()],
    leggi(nome) {
      const v = voci.get(nome); if (!v) return null
      if (extracted + v.usize > MAX_TOTAL) throw new Error('Archivio ZIP troppo grande')
      const dati = buf.subarray(v.data, v.data + v.csize)
      const raw = v.metodo === 0 ? Buffer.from(dati) : zlib.inflateRawSync(dati, { maxOutputLength: Math.max(1, v.usize) })
      if (raw.length !== v.usize || zlib.crc32(raw) !== v.crc) throw new Error('Contenuto ZIP danneggiato')
      extracted += raw.length
      return raw
    },
  }
}

/** Scrive un archivio ZIP (compressione deflate, nomi UTF-8). entries: [{ nome, dati: Buffer }] */
function creaZip(entries) {
  const adesso = new Date()
  const dosTime = (adesso.getHours() << 11) | (adesso.getMinutes() << 5) | (adesso.getSeconds() >> 1)
  const dosDate = ((adesso.getFullYear() - 1980) << 9) | ((adesso.getMonth() + 1) << 5) | adesso.getDate()
  const parti = [], centrale = []; let off = 0
  for (const { nome, dati } of entries) {
    const raw = Buffer.from(dati), nm = Buffer.from(nome, 'utf8'), crc = zlib.crc32(raw)
    const comp = raw.length ? zlib.deflateRawSync(raw, { level: 6 }) : Buffer.alloc(0)
    const usaDeflate = comp.length < raw.length, body = usaDeflate ? comp : raw, metodo = usaDeflate ? 8 : 0
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(metodo, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26)
    parti.push(lh, nm, body)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(metodo, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14)
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42)
    centrale.push(ch, nm); off += 30 + nm.length + body.length
  }
  const cd = Buffer.concat(centrale), eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16)
  return Buffer.concat([...parti, cd, eocd])
}

module.exports = { leggiZip, creaZip }
