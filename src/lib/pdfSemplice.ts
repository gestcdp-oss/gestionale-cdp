// Generatore di PDF essenziali, scritto a mano: nessuna libreria esterna e
// nessuna connessione. Basta per i documenti che il programma produce da sé
// (per ora il Certificato di Avvenuta Prestazione di prova).

export type RigaPdf = { testo: string; grande?: boolean; grassetto?: boolean; spazioPrima?: number }

const LARGHEZZA = 595 // A4 in punti
const ALTEZZA = 842
const MARGINE = 64

/** Nei PDF le parentesi e la barra rovescia vanno protette. */
function protetto(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/**
 * Le lettere accentate non stanno nella tabella di base dei caratteri PDF:
 * si scrivono con il loro codice ottale (WinAnsi).
 */
function ottale(s: string): string {
  let fuori = ''
  for (const c of s) {
    const n = c.charCodeAt(0)
    if (n < 128) fuori += c
    else if (n <= 255) fuori += '\\' + n.toString(8).padStart(3, '0')
    else fuori += '?'
  }
  return fuori
}

/** Costruisce un PDF di una pagina con le righe indicate. */
export function pdfDaRighe(titolo: string, righe: RigaPdf[]): Blob {
  let y = ALTEZZA - MARGINE
  let flusso = ''

  const scrivi = (testo: string, dimensione: number, grassetto: boolean) => {
    const font = grassetto ? '/F2' : '/F1'
    flusso += `BT ${font} ${dimensione} Tf 1 0 0 1 ${MARGINE} ${y} Tm (${ottale(protetto(testo))}) Tj ET\n`
  }

  scrivi(titolo, 18, true)
  y -= 34

  for (const r of righe) {
    y -= r.spazioPrima ?? 0
    if (y < MARGINE) break // una pagina sola: il resto non ci sta
    if (r.testo) scrivi(r.testo, r.grande ? 13 : 11, Boolean(r.grassetto))
    y -= r.grande ? 22 : 17
  }

  const oggetti = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGHEZZA} ${ALTEZZA}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${flusso.length} >>\nstream\n${flusso}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]

  let pdf = '%PDF-1.4\n'
  const posizioni: number[] = []
  oggetti.forEach((o, i) => {
    posizioni.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const inizioTabella = pdf.length
  pdf += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`
  for (const p of posizioni) pdf += `${String(p).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${inizioTabella}\n%%EOF`

  return new Blob([pdf], { type: 'application/pdf' })
}
