import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import type { Immobile } from '../lib/tipi'
import { useSelezione } from '../hooks/useSelezione'
import { usePreferenze } from '../hooks/usePreferenze'
import { GRUPPI_IMMOBILE } from '../lib/menu'

type Vista = 'mappa' | 'streetview'

export default function SchedaImmobilePage() {
  const { immobile } = useSelezione()
  const { modoMappa } = usePreferenze()
  const [dati, setDati] = useState<Immobile | null>(null)
  // si parte da Street View; dove non c'è copertura Google mostra la mappa
  const [vista, setVista] = useState<Vista>('streetview')
  const [urlAnteprima, setUrlAnteprima] = useState<string | null>(null)

  // rileggo i dati completi dell'immobile selezionato
  useEffect(() => {
    if (!immobile) return
    let vivo = true
    void dbLocale.immobili.list().then(({ data }) => {
      if (!vivo || !data) return
      setDati(data.find((i) => i.id === immobile.id) ?? null)
    })
    return () => {
      vivo = false
    }
  }, [immobile])

  const localizzazione = dati?.localizzazione?.trim() || ''

  useEffect(() => {
    if (!localizzazione) {
      setUrlAnteprima(null)
      return
    }
    let vivo = true
    void dbLocale.mappa.anteprima(localizzazione, vista).then(({ data }) => {
      if (vivo) setUrlAnteprima(data ?? null)
    })
    return () => {
      vivo = false
    }
  }, [localizzazione, vista])

  if (!immobile) return <Navigate to="/immobili" replace />

  function apriMappa() {
    if (!localizzazione) return
    void dbLocale.mappa.apri(localizzazione, modoMappa ?? 'finestra')
  }

  return (
    <div className="space-y-6">
      {/* ---------- parte superiore: riepilogo ---------- */}
      <section className="rounded-2xl border border-cielo-200 bg-cielo-50 p-6">
        <h1 className="text-xl font-bold text-cielo-800">
          Scheda Immobile: <span className="text-cielo-600">{dati?.denominazione ?? immobile.denominazione}</span>
        </h1>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* dati */}
          <dl className="grid gap-4 sm:grid-cols-2">
            <Dato etichetta="Asset" valore={dati?.asset ?? immobile.asset} mono />
            <Dato etichetta="Portafoglio" valore={dati?.portafoglio ?? ''} />
            <Dato etichetta="Denominazione" valore={dati?.denominazione ?? immobile.denominazione} />
            <Dato etichetta="Localizzazione" valore={localizzazione} />
          </dl>

          {/* anteprima cartografica */}
          <div>
            {localizzazione ? (
              <>
                <div className="mb-2 flex gap-1">
                  <BottoneVista attiva={vista === 'mappa'} onClick={() => setVista('mappa')}>
                    Mappa
                  </BottoneVista>
                  <BottoneVista attiva={vista === 'streetview'} onClick={() => setVista('streetview')}>
                    Street View
                  </BottoneVista>
                </div>
                <button
                  onClick={apriMappa}
                  title="Apri in Google Maps"
                  className="group relative block h-56 w-full overflow-hidden rounded-xl border border-cielo-300 bg-panna text-left"
                >
                  {urlAnteprima && (
                    <iframe
                      key={urlAnteprima}
                      src={urlAnteprima}
                      title="Anteprima posizione"
                      className="pointer-events-none h-full w-full border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  )}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-cielo-800/70 py-1.5 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                    <IconaMappamondo />
                    Apri in Google Maps
                  </span>
                </button>
              </>
            ) : (
              <Link
                to="/immobili"
                className="flex h-56 w-full flex-col items-center justify-center rounded-xl border border-dashed border-cielo-300 bg-panna p-6 text-center text-sm text-cielo-500 transition hover:border-cielo-400 hover:text-cielo-700"
              >
                <IconaMappamondo />
                <span className="mt-2">Inserisci una localizzazione per vederlo sulla mappa</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ---------- parte inferiore: sezioni dell'immobile ---------- */}
      {GRUPPI_IMMOBILE.map((gruppo) => {
        const voci = gruppo.voci.filter((v) => v.id !== 'scheda')
        if (!voci.length) return null
        return (
          <section key={gruppo.titolo}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">{gruppo.titolo}</h2>
            <div className="mt-3 flex flex-wrap gap-4">
              {voci.map((v) => (
                <Riquadro key={v.id} to={v.percorso} titolo={v.etichetta} desc={v.descrizione} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Dato({ etichetta, valore, mono }: { etichetta: string; valore: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</dt>
      <dd className={`mt-1 text-cielo-800 ${mono ? 'font-mono' : ''}`}>{valore || '—'}</dd>
    </div>
  )
}

function BottoneVista({
  attiva,
  onClick,
  children,
}: {
  attiva: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
        attiva ? 'bg-cielo-500 text-white' : 'border border-cielo-300 text-cielo-600 hover:bg-panna'
      }`}
    >
      {children}
    </button>
  )
}

/** Riquadro di una sezione: stessa dimensione per tutti, va a capo da solo. */
function Riquadro({ to, titolo, desc }: { to?: string; titolo: string; desc?: string }) {
  const contenuto = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="font-semibold text-cielo-800">{titolo}</span>
        {!to && (
          <span className="shrink-0 rounded-full bg-cielo-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-cielo-500">
            presto
          </span>
        )}
      </span>
      {desc && <span className="mt-1.5 block text-xs leading-snug text-cielo-600">{desc}</span>}
    </>
  )

  const base = 'w-56 shrink-0 rounded-xl border p-4 transition'
  return to ? (
    <Link to={to} className={`${base} border-cielo-200 bg-panna hover:border-cielo-400 hover:shadow-sm`}>
      {contenuto}
    </Link>
  ) : (
    <div className={`${base} cursor-default border-dashed border-cielo-200 bg-panna/60`}>{contenuto}</div>
  )
}

function IconaMappamondo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
