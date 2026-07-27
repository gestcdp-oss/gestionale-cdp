import { useState } from 'react'
import { creaFileArchivio, apriArchivioDaFile } from '../lib/dbBrowser'

const LOGO = './logo.svg'

/**
 * Porta d'ingresso della versione browser: finché non c'è un file archivio
 * collegato, prima di entrare nel programma si chiede se crearne uno nuovo o
 * aprire/importare un archivio esistente. Così i dati nascono subito al sicuro
 * in un file vero del computer.
 */
export default function ArchivioGatePage({ onFine }: { onFine: () => void }) {
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState<'crea' | 'apri' | null>(null)

  async function crea() {
    setErrore(null)
    setAttesa('crea')
    const esito = await creaFileArchivio()
    setAttesa(null)
    if (!esito.ok) {
      if (esito.messaggio) setErrore(esito.messaggio)
      return
    }
    onFine()
  }

  async function apri() {
    setErrore(null)
    setAttesa('apri')
    const esito = await apriArchivioDaFile()
    setAttesa(null)
    if (!esito.ok) {
      if (esito.messaggio) setErrore(esito.messaggio)
      return
    }
    // l'archivio (utenti compresi) è stato sostituito: si riparte dal login
    window.location.reload()
  }

  function nonOra() {
    try {
      sessionStorage.setItem('travi_gate_rimandato', 'si')
    } catch {
      /* ignora */
    }
    onFine()
  }

  return (
    <div className="flex min-h-full items-center justify-center overflow-y-auto bg-cielo-100 p-6">
      <div className="w-full max-w-xl rounded-2xl border border-cielo-200 bg-panna p-8 shadow-sm">
        <div className="text-center">
          <img src={LOGO} alt="" className="mx-auto h-20 w-20" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-cielo-800">Dove salviamo l'archivio?</h1>
          <p className="mt-2 text-sm leading-relaxed text-cielo-600">
            I tuoi dati vivono in un <b>file sul tuo computer</b>: sopravvive alle pulizie del browser, si può
            copiare come backup e si può aprire da qualsiasi browser.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => void crea()}
            disabled={attesa !== null}
            className="rounded-xl border-2 border-cielo-400 bg-cielo-50 p-5 text-left transition hover:border-cielo-500 hover:bg-cielo-100 disabled:opacity-50"
          >
            <span className="block text-2xl">🆕</span>
            <span className="mt-2 block font-semibold text-cielo-800">
              {attesa === 'crea' ? 'Creazione…' : 'Crea un archivio nuovo'}
            </span>
            <span className="mt-1 block text-xs leading-snug text-cielo-600">
              Scegli dove salvare il file (consigliato: Documenti). I dati presenti in questo browser vengono
              conservati e salvati lì.
            </span>
          </button>

          <button
            onClick={() => void apri()}
            disabled={attesa !== null}
            className="rounded-xl border-2 border-cielo-300 bg-panna p-5 text-left transition hover:border-cielo-400 hover:bg-cielo-50 disabled:opacity-50"
          >
            <span className="block text-2xl">📂</span>
            <span className="mt-2 block font-semibold text-cielo-800">
              {attesa === 'apri' ? 'Apertura…' : 'Apri un archivio esistente'}
            </span>
            <span className="mt-1 block text-xs leading-snug text-cielo-600">
              Hai già un file TR.A.V.I. (tuo o ricevuto)? Aprilo: verrà caricato tutto, utenti compresi, e si
              entra con le credenziali di quell'archivio.
            </span>
          </button>
        </div>

        {errore && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}

        <div className="mt-5 text-center">
          <button onClick={nonOra} className="text-xs text-cielo-500 underline hover:text-cielo-700">
            Non ora: continua senza file (i dati restano solo in questo browser)
          </button>
        </div>
      </div>
    </div>
  )
}
