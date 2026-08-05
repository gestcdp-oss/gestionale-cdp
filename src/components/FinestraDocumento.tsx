import { useEffect, useState } from 'react'
import { dbLocale } from '../lib/db'
import { paragrafiDaDocx } from '../lib/documenti'
import type { ParagrafoDocx } from '../lib/documenti'
import Finestra from './Finestra'

/**
 * Mostra un documento dell'archivio (la lettera o un allegato) in una finestra
 * trascinabile dentro la pagina. I PDF si sfogliano direttamente; per gli altri
 * formati resta il pulsante per aprirli con il programma del computer.
 */
export default function FinestraDocumento({ id, onChiudi }: { id: string; onChiudi: () => void }) {
  const [documento, setDocumento] = useState<{
    nome: string
    /** nome univoco con cui il file vive sul disco */
    nomeArchivio: string
    tipo: string
    url: string
  } | null>(null)
  const [pagine, setPagine] = useState<ParagrafoDocx[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    let daLiberare = ''
    void dbLocale.documenti.apri(id).then(async ({ data, error }) => {
      if (!vivo) return
      if (error || !data) {
        setErrore(error?.message ?? 'Documento non trovato nell\'archivio.')
        return
      }
      // dal testo base64 si torna al file vero, senza passare da internet
      const byte = Uint8Array.from(atob(data.contenuto), (c) => c.charCodeAt(0))
      const blob = new Blob([byte], { type: data.tipo || 'application/pdf' })
      const url = URL.createObjectURL(blob)
      daLiberare = url
      setDocumento({
        nome: data.nome,
        nomeArchivio: data.nomeArchivio || data.nome,
        tipo: data.tipo,
        url,
      })
      // i Word non si sfogliano come i PDF: se ne mostra il contenuto
      if (eWord(data.nome, data.tipo)) {
        try {
          const p = await paragrafiDaDocx(blob)
          if (vivo) setPagine(p)
        } catch (e) {
          if (vivo) setErrore(String((e as Error)?.message ?? e))
        }
      }
    })
    return () => {
      vivo = false
      if (daLiberare) URL.revokeObjectURL(daLiberare)
    }
  }, [id])

  const sfogliabile = Boolean(documento && /pdf/i.test(documento.tipo))
  const daLeggere = Boolean(documento && eWord(documento.nome, documento.tipo))

  return (
    <Finestra
      titolo={documento?.nome ?? 'Documento'}
      larghezza={860}
      altezza={620}
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
      ) : !documento ? (
        <p className="flex h-full items-center justify-center text-sm text-cielo-500">Apertura…</p>
      ) : sfogliabile ? (
        <iframe src={documento.url} title={documento.nome} className="h-full w-full border-0" />
      ) : daLeggere ? (
        pagine ? (
          /* il Word viene mostrato come un foglio: testo, grassetti e centrature */
          <div className="h-full overflow-y-auto bg-cielo-100 p-6">
            <div className="mx-auto max-w-[46rem] rounded-lg bg-white p-10 shadow-sm">
              {pagine.map((p, i) => (
                <p
                  key={i}
                  className={`mb-3 text-[13px] leading-relaxed text-neutral-800 ${
                    p.grassetto ? 'font-semibold' : ''
                  } ${p.centrato ? 'text-center' : ''}`}
                >
                  {p.testo}
                </p>
              ))}
              <p className="mt-6 border-t border-neutral-200 pt-3 text-[11px] text-neutral-400">
                Contenuto del documento Word. Per vederlo con l'impaginazione originale, aprilo con Word dal
                pulsante «Salva una copia».
              </p>
            </div>
          </div>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-cielo-500">Lettura del documento…</p>
        )
      ) : (
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
    </Finestra>
  )
}

function eWord(nome: string, tipo: string): boolean {
  return /\.docx$/i.test(nome) || /wordprocessingml/i.test(tipo)
}

function IconaFoglio() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cielo-600">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}
