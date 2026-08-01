// Lettura del testo dei PDF, tutta dentro il programma: il file non esce mai
// dal computer (nessun servizio online, nessun caricamento in rete).

/**
 * Restituisce il testo di un PDF, pagina per pagina. Se il PDF è fatto di sole
 * immagini (scansione) il testo esce vuoto: chi chiama deve dirlo all'utente.
 *
 * Il lettore PDF pesa parecchio e serve solo qui: viene caricato alla prima
 * lettura, così l'avvio del programma resta leggero.
 */
export async function testoDaPdf(file: File | Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const lavoratore = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = lavoratore

  const dati = new Uint8Array(await file.arrayBuffer())
  const compito = pdfjs.getDocument({ data: dati })
  const documento = await compito.promise
  try {
    const pagine: string[] = []
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n)
      const contenuto = await pagina.getTextContent()
      // gli elementi arrivano in ordine di lettura: si ricostruiscono le righe
      // guardando dove finisce una riga e comincia la successiva
      let riga = ''
      const righe: string[] = []
      for (const voce of contenuto.items) {
        const v = voce as { str?: string; hasEOL?: boolean }
        riga += v.str ?? ''
        if (v.hasEOL) {
          righe.push(riga)
          riga = ''
        }
      }
      if (riga) righe.push(riga)
      pagine.push(righe.join('\n'))
    }
    return pagine.join('\n')
  } finally {
    void compito.destroy()
  }
}
