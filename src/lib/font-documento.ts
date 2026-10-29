import type { FontDocumento, ModelloPdf } from '../types'

export const FONT_DOCUMENTO = [
  { id: 'arial', nome: 'Arial', css: 'Arial,Helvetica,sans-serif' },
  { id: 'georgia', nome: 'Georgia', css: 'Georgia,"Times New Roman",serif' },
  { id: 'times', nome: 'Times New Roman', css: '"Times New Roman",Times,serif' },
  { id: 'verdana', nome: 'Verdana', css: 'Verdana,Arial,sans-serif' },
  { id: 'courier', nome: 'Courier New', css: '"Courier New",Courier,monospace' },
] as const
export const MAX_FONT_BYTES = 2 * 1024 * 1024
export const MAX_FONT_TOTAL = 4 * 1024 * 1024
export const MAX_FONT_COUNT = 4
const ID = /^font-[a-f0-9]{32}$/
const FORMATI = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' } as const

/** Only inline font data and generated identifiers may enter document CSS. */
export function fontValidi(font: FontDocumento[] = []): FontDocumento[] {
  if (!Array.isArray(font)) return []
  let totale = 0
  const ids = new Set<string>()
  return font.slice(0, MAX_FONT_COUNT).filter(f => {
    if (!f || !ID.test(f.id) || ids.has(f.id) || !Object.hasOwn(FORMATI, f.formato) || typeof f.dati !== 'string') return false
    const prefix = `data:font/${f.formato};base64,`
    if (!f.dati.startsWith(prefix)) return false
    const base64 = f.dati.slice(prefix.length)
    const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
    if (!base64 || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || bytes > MAX_FONT_BYTES || totale + bytes > MAX_FONT_TOTAL) return false
    totale += bytes
    ids.add(f.id)
    return true
  })
}

export function famigliaFont(id: string | undefined, fonts: FontDocumento[] = []): string {
  const standard = FONT_DOCUMENTO.find(f => f.id === id)
  if (standard) return standard.css
  return ID.test(id || '') && fontValidi(fonts).some(f => f.id === id) ? `"MNGMNT_${id}",Arial,sans-serif` : FONT_DOCUMENTO[0].css
}

export function fontFaceCss(m: ModelloPdf): string {
  const usati = new Set([m.fontDocumento, ...[...m.intestazione, ...m.pagamento, ...m.footer].map(r => r.font)])
  return fontValidi(m.fontPersonali).filter(f => usati.has(f.id)).map(f =>
    `@font-face{font-family:"MNGMNT_${f.id}";src:url("${f.dati}") format("${FORMATI[f.formato]}");font-display:block;}`
  ).join('\n')
}

export async function leggiFont(file: File, presenti: FontDocumento[]): Promise<FontDocumento> {
  if (file.size > MAX_FONT_BYTES) throw new Error('Il font supera il limite di 2 MB.')
  if (presenti.length >= MAX_FONT_COUNT) throw new Error('Puoi conservare fino a 4 font personali. Rimuovine uno per continuare.')
  const formato = file.name.split('.').pop()?.toLowerCase() as FontDocumento['formato']
  if (!Object.hasOwn(FORMATI, formato)) throw new Error('Scegli un font TTF, OTF, WOFF o WOFF2.')
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const magic = Array.from(bytes.slice(0, 4)).map(b => String.fromCharCode(b)).join('')
  if (!({ ttf: '\x00\x01\x00\x00', otf: 'OTTO', woff: 'wOFF', woff2: 'wOF2' }[formato] === magic)) throw new Error('Il file non contiene un font del formato dichiarato.')
  const totale = presenti.reduce((n, f) => n + (f.dati.split(',')[1]?.length || 0) * 3 / 4, 0)
  if (totale + buffer.byteLength > MAX_FONT_TOTAL) throw new Error('I font personali possono occupare al massimo 4 MB in totale.')
  const id = `font-${crypto.randomUUID().replaceAll('-', '')}`
  try { await new FontFace(`MNGMNT_${id}`, buffer).load() } catch { throw new Error('Il font non è leggibile. Prova un altro file.') }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  const dati = `data:font/${formato};base64,${btoa(binary)}`
  if (presenti.some(f => f.dati === dati)) throw new Error('Questo font è già presente.')
  return { id, nome: file.name.replace(/\.[^.]+$/, '').slice(0, 80), formato, dati }
}
