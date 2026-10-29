import type { ModelloPdf, RigaModello, Settings } from '../types'

export const riga = (testo: string, o: Partial<RigaModello> = {}): RigaModello => ({ testo, dimensione: 'normale', grassetto: false, corsivo: false, allineamento: 'centro', ...o })

const cittaDa = (capCitta: string) => (capCitta || '').replace(/^\d{5}\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim()

/** Modello predefinito costruito dai dati dello studio (come nel modello Excel: nome in alto, coordinate di pagamento, riepilogo in fondo). */
export function modelloPredefinito(s: Settings): ModelloPdf {
  const st = s.studio
  const contatti = [st.telefono, st.email, st.pec && `PEC ${st.pec}`].filter(Boolean).join(' · ')
  const sede = [st.indirizzo, st.cap_citta].filter(Boolean).join(' - ')
  const fisc = [st.cf && `Codice fiscale ${st.cf}`, st.piva && `Partita IVA ${st.piva}`].filter(Boolean).join(' ')
  return {
    intestazione: [riga(st.intestazione || st.nome || 'Nome dello studio', { dimensione: 'grande', grassetto: true }), ...(contatti ? [riga(contatti, { dimensione: 'piccola' })] : [])],
    pagamento: st.iban ? [riga(`Pagamento: bonifico bancario IBAN ${st.iban}`, { grassetto: true, allineamento: 'sinistra' }), ...(st.banca ? [riga(st.banca, { allineamento: 'sinistra' })] : [])] : [],
    footer: [
      ...(sede ? [riga(`Studio legale: ${sede}`, { dimensione: 'piccola' })] : []),
      ...(st.domicilio_fiscale ? [riga(`Domicilio fiscale: ${st.domicilio_fiscale}`, { dimensione: 'piccola' })] : []),
      ...(fisc ? [riga(fisc, { dimensione: 'piccola' })] : []),
    ],
    logo: null, logoAltezza: 60, logoAllineamento: 'centro', mostraLuogoData: true, luogo: cittaDa(st.cap_citta),
    immagineFooter: null, immagineFooterAltezza: 36, immagineFooterAllineamento: 'centro', fontDocumento: 'arial', fontPersonali: [],
  }
}

/** Modello in uso: quello personalizzato dall'utente oppure quello predefinito. */
export function modelloEffettivo(s: Settings): ModelloPdf {
  const d = modelloPredefinito(s)
  const m = s.modello_pdf
  return m ? { ...d, ...m, intestazione: m.intestazione ?? d.intestazione, pagamento: m.pagamento ?? d.pagamento, footer: m.footer ?? d.footer } : d
}
