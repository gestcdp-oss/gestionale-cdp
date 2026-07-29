import { useCallback, useEffect, useRef, useState } from 'react'

const LARGHEZZA = 720
const ALTEZZA = 480

/**
 * Riquadro con Google Maps dentro la pagina: si trascina per la barra del
 * titolo e si ridimensiona dall'angolo in basso a destra. Serve a consultare la
 * posizione senza aprire una scheda del browser.
 */
export default function FinestraMappa({
  titolo,
  url,
  urlEsterno,
  onChiudi,
}: {
  titolo: string
  url: string | null
  urlEsterno: string
  onChiudi: () => void
}) {
  const [pos, setPos] = useState(() => ({
    x: Math.max(12, Math.round((window.innerWidth - LARGHEZZA) / 2)),
    y: Math.max(12, Math.round((window.innerHeight - ALTEZZA) / 2)),
  }))
  // durante il trascinamento l'iframe non deve "mangiare" il mouse
  const [trascino, setTrascino] = useState(false)
  const scarto = useRef({ x: 0, y: 0 })

  const muovi = useCallback((e: MouseEvent) => {
    setPos({
      x: Math.min(window.innerWidth - 120, Math.max(-LARGHEZZA + 160, e.clientX - scarto.current.x)),
      y: Math.min(window.innerHeight - 60, Math.max(0, e.clientY - scarto.current.y)),
    })
  }, [])

  const rilascia = useCallback(() => setTrascino(false), [])

  useEffect(() => {
    if (!trascino) return
    window.addEventListener('mousemove', muovi)
    window.addEventListener('mouseup', rilascia)
    return () => {
      window.removeEventListener('mousemove', muovi)
      window.removeEventListener('mouseup', rilascia)
    }
  }, [trascino, muovi, rilascia])

  // Esc chiude, come in una finestra vera
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi()
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [onChiudi])

  function iniziaTrascinamento(e: React.MouseEvent) {
    scarto.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setTrascino(true)
  }

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: LARGHEZZA, height: ALTEZZA }}
      className="fixed z-40 flex min-h-[220px] min-w-[320px] resize overflow-hidden rounded-2xl border border-cielo-300 bg-panna shadow-2xl"
    >
      <div className="flex w-full flex-col">
        {/* barra del titolo: è la maniglia per spostare il riquadro */}
        <div
          onMouseDown={iniziaTrascinamento}
          className="flex cursor-move select-none items-center gap-2 border-b border-cielo-200 bg-cielo-100 px-3 py-2"
        >
          <IconaMappamondo />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-cielo-800" title={titolo}>
            {titolo}
          </span>
          <a
            href={urlEsterno}
            target="_blank"
            rel="noopener noreferrer"
            onMouseDown={(e) => e.stopPropagation()}
            title="Apri Google Maps completo in una scheda del browser"
            className="rounded px-2 py-1 text-xs text-cielo-600 transition hover:bg-cielo-200 hover:text-cielo-800"
          >
            Apri in Google Maps
          </a>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onChiudi}
            title="Chiudi (Esc)"
            className="flex h-6 w-6 items-center justify-center rounded text-cielo-600 transition hover:bg-cielo-200 hover:text-cielo-900"
          >
            ×
          </button>
        </div>

        <div className="relative flex-1 bg-cielo-50">
          {url ? (
            <iframe
              key={url}
              src={url}
              title={`Mappa: ${titolo}`}
              className="h-full w-full border-0"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-cielo-500">Caricamento mappa…</p>
          )}
          {/* mentre si trascina, il velo impedisce all'iframe di rubare il mouse */}
          {trascino && <div className="absolute inset-0" />}
        </div>
      </div>
    </div>
  )
}

function IconaMappamondo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cielo-600">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
