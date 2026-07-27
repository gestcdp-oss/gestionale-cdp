import { useEffect, useState } from 'react'
import { eModalitaBrowser, urlConVersione } from '../lib/dbBrowser'

/**
 * Versione browser: se mentre si lavora esce una nuova versione del programma,
 * compare questo avviso. "Aggiorna adesso" ricarica con un indirizzo che
 * scavalca la cache, così si è certi di ricevere la versione nuova.
 */
export default function AggiornaWebBanner() {
  const [versione, setVersione] = useState<string | null>(null)

  useEffect(() => {
    if (!eModalitaBrowser()) return
    const gestore = (e: Event) => setVersione(String((e as CustomEvent).detail || ''))
    window.addEventListener('travi-versione-nuova', gestore)
    return () => window.removeEventListener('travi-versione-nuova', gestore)
  }, [])

  if (!versione) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="flex max-w-2xl flex-wrap items-center gap-4 rounded-xl bg-amber-500 px-5 py-3 text-white shadow-lg">
        <span className="flex items-center gap-2 text-sm font-medium">
          <IconaAggiornamento />
          È disponibile la versione {versione} del programma
        </span>
        <span className="flex gap-2">
          <button
            onClick={() => window.location.replace(urlConVersione(versione))}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
          >
            Aggiorna adesso
          </button>
          <button
            onClick={() => setVersione(null)}
            title="Verrà caricata comunque alla prossima apertura"
            className="rounded-lg border border-white/60 px-3 py-1.5 text-sm text-white transition hover:bg-amber-600"
          >
            Più tardi
          </button>
        </span>
      </div>
    </div>
  )
}

function IconaAggiornamento() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}
