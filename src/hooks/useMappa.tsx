import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import { eModalitaBrowser } from '../lib/dbBrowser'
import { usePreferenze } from './usePreferenze'
import FinestraMappa from '../components/FinestraMappa'

/**
 * Apertura della mappa da qualsiasi pagina. Due modi, ricordati nelle
 * preferenze dell'utente: dentro l'app (riquadro trascinabile, senza uscire dal
 * programma) oppure in una scheda del browser.
 */
type Ctx = { apri: (localizzazione: string) => void }

const MappaCtx = createContext<Ctx | undefined>(undefined)

export function urlGoogleMaps(q: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function MappaProvider({ children }: { children: ReactNode }) {
  const { modoMappa, impostaModoMappa } = usePreferenze()
  // localizzazione mostrata nel riquadro interno
  const [inFinestra, setInFinestra] = useState<string | null>(null)
  const [urlFinestra, setUrlFinestra] = useState<string | null>(null)
  // al primo utilizzo si chiede dove aprirla
  const [daChiedere, setDaChiedere] = useState<string | null>(null)

  useEffect(() => {
    if (!inFinestra) {
      setUrlFinestra(null)
      return
    }
    let vivo = true
    void dbLocale.mappa.anteprima(inFinestra, 'mappa').then(({ data }) => {
      if (vivo) setUrlFinestra(data ?? null)
    })
    return () => {
      vivo = false
    }
  }, [inFinestra])

  const apriCon = useCallback((q: string, modo: 'finestra' | 'browser') => {
    // dentro l'app: riquadro nella pagina (nella versione desktop è Electron ad
    // aprire una sua finestra); nel browser: scheda nuova
    if (modo === 'finestra' && eModalitaBrowser()) {
      setInFinestra(q)
      return
    }
    void dbLocale.mappa.apri(q, modo)
  }, [])

  const apri = useCallback(
    (localizzazione: string) => {
      const q = String(localizzazione || '').trim()
      if (!q) return
      if (!modoMappa) {
        setDaChiedere(q)
        return
      }
      apriCon(q, modoMappa)
    },
    [modoMappa, apriCon],
  )

  function scegli(modo: 'finestra' | 'browser') {
    const q = daChiedere
    impostaModoMappa(modo)
    setDaChiedere(null)
    if (q) apriCon(q, modo)
  }

  return (
    <MappaCtx.Provider value={{ apri }}>
      {children}

      {inFinestra && (
        <FinestraMappa
          titolo={inFinestra}
          url={urlFinestra}
          urlEsterno={urlGoogleMaps(inFinestra)}
          onChiudi={() => setInFinestra(null)}
        />
      )}

      {daChiedere && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4"
          onClick={() => setDaChiedere(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-cielo-800">Dove vuoi aprire la mappa?</h3>
            <p className="mt-2 text-sm text-cielo-700">
              Scegli come aprire <b>{daChiedere}</b> su Google Maps. La scelta viene ricordata e resta
              modificabile in <b>Utenti › Preferenze</b>.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => scegli('finestra')}
                className="rounded-xl border border-cielo-300 bg-white p-4 text-left transition hover:border-cielo-400 hover:bg-cielo-50"
              >
                <span className="block font-medium text-cielo-800">Dentro il programma</span>
                <span className="mt-1 block text-xs text-cielo-600">
                  Riquadro trascinabile nella pagina: niente schede del browser.
                </span>
              </button>
              <button
                onClick={() => scegli('browser')}
                className="rounded-xl border border-cielo-300 bg-white p-4 text-left transition hover:border-cielo-400 hover:bg-cielo-50"
              >
                <span className="block font-medium text-cielo-800">Nel browser</span>
                <span className="mt-1 block text-xs text-cielo-600">
                  Apre Google Maps completo in una scheda nuova.
                </span>
              </button>
            </div>
            <button
              onClick={() => setDaChiedere(null)}
              className="mt-4 w-full rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </MappaCtx.Provider>
  )
}

export function useMappa(): Ctx {
  const c = useContext(MappaCtx)
  if (!c) throw new Error('useMappa va usato dentro <MappaProvider>')
  return c
}
