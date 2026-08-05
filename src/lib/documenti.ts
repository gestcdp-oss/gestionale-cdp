// Lettura del testo dai documenti caricati (PDF e Word), tutta dentro il
// programma: il file non esce mai dal computer.

import { testoDaPdf } from './pdf'

/** Testo di un file .docx: dentro è uno zip con il documento in XML. */
export async function testoDaDocx(file: File | Blob): Promise<string> {
  // libreria di decompressione caricata solo quando serve davvero
  const { unzipSync } = await import('fflate')
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const documento = zip['word/document.xml']
  if (!documento) throw new Error('Questo file Word non è leggibile: manca il documento interno.')
  const xml = new TextDecoder('utf-8').decode(documento)

  const righe: string[] = []
  // ogni <w:p> è un paragrafo, ogni <w:t> un pezzo di testo
  for (const paragrafo of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const pezzi = paragrafo.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []
    const testo = pezzi
      .map((p) => p.replace(/<[^>]+>/g, ''))
      .join('')
      // le interruzioni di riga dentro il paragrafo diventano spazi
      .replace(/<w:br\s*\/?>/g, ' ')
    const pulito = decodifica(testo).trim()
    if (pulito) righe.push(pulito)
  }
  return righe.join('\n')
}

function decodifica(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

/**
 * Testo di un documento caricato: riconosce PDF e Word dal nome del file.
 * Solleva un errore con una spiegazione leggibile se il formato non va.
 */
export async function testoDaDocumento(file: File): Promise<string> {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.pdf')) return testoDaPdf(file)
  if (nome.endsWith('.docx')) return testoDaDocx(file)
  if (nome.endsWith('.doc')) {
    throw new Error(
      'Il formato Word vecchio (.doc) non si legge: apri il file e salvalo come .docx oppure come PDF.',
    )
  }
  throw new Error('Si possono caricare solo PDF o documenti Word (.docx).')
}
