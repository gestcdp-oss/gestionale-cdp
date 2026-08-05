import { useEffect, useRef, useState } from 'react'
import { dbLocale } from '../lib/db'
import Finestra from './Finestra'
import Avanzamento from './Avanzamento'

/**
 * Mostra un documento dell'archivio (la lettera o un allegato) in una finestra
 * trascinabile dentro la pagina. I PDF si sfogliano direttamente; i Word vengono
 * impaginati con i loro stili veri, così si vedono come li mostra Word.
 */
export default function FinestraDocumento({ id, onChiudi }: { id: string; onChiudi: () => void }) {
  const [documento, setDocumento] = useState<{
    nome: string
    /** nome univoco con cui il file vive sul disco */
    nomeArchivio: string
    tipo: string
    url: string
  } | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  // a che punto è l'apertura: serve per la barra di avanzamento
  const [fase, setFase] = useState<{ testo: string; percentuale: number } | null>({
    testo: 'Apertura del documento',
    percentuale: 5,
  })
  const foglio = useRef<HTMLDivElement | null>(null)
  // gli stili del Word vanno in un contenitore tutto loro: se finiscono
  // insieme al testo, l'impaginazione li cancella e il documento si imbruttisce
  const stili = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let vivo = true
    let daLiberare = ''
    void (async () => {
      try {
        setFase({ testo: 'Lettura dall\'archivio', percentuale: 15 })
        const { data, error } = await dbLocale.documenti.apri(id)
        if (!vivo) return
        if (error || !data) {
          setErrore(error?.message ?? 'Documento non trovato nell\'archivio.')
          setFase(null)
          return
        }

        setFase({ testo: 'Ricostruzione del file', percentuale: 40 })
        // dal testo base64 si torna al file vero, senza passare da internet
        const byte = Uint8Array.from(atob(data.contenuto), (c) => c.charCodeAt(0))
        const blob = new Blob([byte], { type: data.tipo || 'application/pdf' })
        const url = URL.createObjectURL(blob)
        daLiberare = url
        if (!vivo) return
        setDocumento({
          nome: data.nome,
          nomeArchivio: data.nomeArchivio || data.nome,
          tipo: data.tipo,
          url,
        })

        if (eWord(data.nome, data.tipo)) {
          // il Word si impagina qui dentro, con font, margini, tabelle e immagini
          setFase({ testo: 'Impaginazione del documento Word', percentuale: 65 })
          const { renderAsync } = await import('docx-preview')
          // il contenitore compare col giro di disegno seguente: lo si attende
          // senza legarsi al disegno vero, se no in una scheda lasciata da parte
          // l'impaginazione non partirebbe mai
          for (let giro = 0; giro < 40 && !foglio.current; giro++) {
            await new Promise((r) => setTimeout(r, 25))
          }
          if (!vivo || !foglio.current || !stili.current) return
          setFase({ testo: 'Impaginazione del documento Word', percentuale: 85 })
          await renderAsync(blob, foglio.current, stili.current, {
            className: 'docx',
            inWrapper: true,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            experimental: true,
            useBase64URL: true,
          })
        }
        if (vivo) setFase(null)
      } catch (e) {
        if (vivo) {
          setErrore(String((e as Error)?.message ?? e))
          setFase(null)
        }
      }
    })()
    return () => {
      vivo = false
      if (daLiberare) URL.revokeObjectURL(daLiberare)
    }
  }, [id])

  const sfogliabile = Boolean(documento && /pdf/i.test(documento.tipo))
  const daImpaginare = Boolean(documento && eWord(documento.nome, documento.tipo))

  return (
    <Finestra
      titolo={documento?.nome ?? 'Documento'}
      larghezza={880}
      altezza={640}
      onChiudi={onChiudi}
      icona={<IconaFoglio />}
      azioni={
        documento && (
          <a
            href={documento.url}
            download={documento.nomeArchivio}
            title={`Salva sul computer come ${documento.nomeArchivio}`}
            className="rounded px-2 py-1 text-xs text-cielo-600 transition hover:bg-cielo-200 hover:text-cielo-800"
          >
            Salva una copia
          </a>
        )
      }
    >
      {errore ? (
        <p className="flex h-full items-center justify-center p-6 text-center text-sm text-red-700">{errore}</p>
      ) : (
        <div className="relative h-full">
          {sfogliabile && (
            <iframe src={documento!.url} title={documento!.nome} className="h-full w-full border-0" />
          )}

          {/* il foglio del Word: resta montato perché l'impaginazione ci scrive dentro */}
          {daImpaginare && (
            <>
              <div ref={stili} className="hidden" />
              <div className="h-full overflow-auto">
                <div ref={foglio} />
              </div>
            </>
          )}

          {fase && (
            <div className="absolute inset-0 flex items-center justify-center bg-panna/90">
              <Avanzamento testo={fase.testo} percentuale={fase.percentuale} />
            </div>
          )}

          {!fase && documento && !sfogliabile && !daImpaginare && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-4xl">📄</p>
              <p className="text-sm text-cielo-700">
                Questo tipo di file non si può mostrare qui: aprilo con il programma del computer.
              </p>
              <a
                href={documento.url}
                download={documento.nomeArchivio}
                className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
              >
                Apri {documento.nome}
              </a>
            </div>
          )}
        </div>
      )}
    </Finestra>
  )
}

function eWord(nome: string, tipo: string): boolean {
  return /\.docx?$/i.test(nome) || /wordprocessingml|msword/i.test(tipo)
}

function IconaFoglio() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cielo-600">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}
