/** Riduce un'immagine scelta dall'utente (max 700 px di larghezza) e la restituisce come data URL, per non appesantire il database. */
export async function leggiImmagine(file: File): Promise<string> {
  // Inline data URLs also work under the application's restrictive image CSP.
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Immagine non leggibile'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Immagine non leggibile')); i.src = url })
  const k = Math.min(1, 700 / img.width, 1400 / img.height)
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}
