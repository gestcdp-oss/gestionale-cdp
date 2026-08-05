import { useEffect } from 'react'
import type { ReactNode } from 'react'

/**
 * Conferma semplice: si legge e si risponde. Per le cancellazioni gravi, dove
 * un clic distratto costerebbe caro, c'è invece ConfermaCodice.
 */
export default function Conferma({
  titolo,
  azione,
  children,
  onAnnulla,
  onConferma,
}: {
  titolo: string
  azione: string
  children: ReactNode
  onAnnulla: () => void
  onConferma: () => void
}) {
  useEffect(() => {
    function tasto(e: KeyboardEvent) {
      if (e.key === 'Escape') onAnnulla()
      if (e.key === 'Enter') onConferma()
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [onAnnulla, onConferma])

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-panna p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-red-800">{titolo}</h3>
        <div className="mt-2 text-sm leading-relaxed text-cielo-700">{children}</div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onAnnulla}
            className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
          >
            Annulla
          </button>
          <button
            onClick={onConferma}
            autoFocus
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            {azione}
          </button>
        </div>
      </div>
    </div>
  )
}
