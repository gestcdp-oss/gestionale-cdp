import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import { useSelezione } from '../hooks/useSelezione'
import { useImmobili } from '../hooks/useImmobili'
import { usePreferenze } from '../hooks/usePreferenze'
import { GRUPPI_IMMOBILE } from '../lib/menu'
import Icona from '../components/Icone'
import type { NomeIcona } from '../components/Icone'

type Vista = 'mappa' | 'streetview'

const VUOTO = { asset: '', denominazione: '', portafoglio: '', localizzazione: '' }

export default function SchedaImmobilePage() {
  const { immobile, seleziona } = useSelezione()
  const { immobili, aggiorna } = useImmobili()
  const { modoMappa } = usePreferenze()
  // i dati arrivano dalla fonte condivisa: ogni modifica si riflette ovunque
  const dati = immobili.find((i) => i.id === immobile?.id) ?? null
  const [modifica, setModifica] = useState(false)
  const [form, setForm] = useState(VUOTO)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)
  // si parte da Street View; dove non c'è copertura Google mostra la mappa
  const [vista, setVista] = useState<Vista>('streetview')
  const [urlAnteprima, setUrlAnteprima] = useState<string | null>(null)

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

  function avviaModifica() {
    if (!dati) return
    setErrore(null)
    setForm({
      asset: dati.asset,
      denominazione: dati.denominazione,
      portafoglio: dati.portafoglio ?? '',
      localizzazione: dati.localizzazione ?? '',
    })
    setModifica(true)
  }

  async function salva() {
    if (!dati) return
    setErrore(null)
    if (!form.asset.trim() || !form.denominazione.trim()) {
      setErrore('Asset e Denominazione sono obbligatori.')
      return
    }
    setSalvataggio(true)
    const campi = {
      asset: form.asset.trim(),
      denominazione: form.denominazione.trim(),
      portafoglio: form.portafoglio.trim() || null,
      localizzazione: form.localizzazione.trim() || null,
    }
    const esito = await aggiorna(dati.id, campi)
    setSalvataggio(false)
    if (!esito.ok) {
      setErrore(
        esito.codice === '23505'
          ? 'Esiste già un altro immobile con questo Asset o questa Denominazione.'
          : (esito.messaggio ?? 'Salvataggio non riuscito.'),
      )
      return
    }
    // l'etichetta in alto segue il nuovo nome
    seleziona({ id: dati.id, asset: campi.asset, denominazione: campi.denominazione })
    setModifica(false)
  }

  return (
    <div className="space-y-6">
      {/* ---------- parte superiore: riepilogo ---------- */}
      <section className="rounded-2xl border border-cielo-200 bg-cielo-50 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-cielo-800">
            Scheda Immobile: <span className="text-cielo-600">{dati?.denominazione ?? immobile.denominazione}</span>
          </h1>
          <span className="rounded-full border border-cielo-300 bg-panna px-2.5 py-1 font-mono text-xs text-cielo-700">
            Asset {dati?.asset ?? immobile.asset}
          </span>
          <span className="ml-auto flex gap-2">
            {modifica ? (
              <>
                <button
                  onClick={() => setModifica(false)}
                  disabled={salvataggio}
                  className="rounded-lg px-3 py-1.5 text-sm text-cielo-600 transition hover:bg-cielo-100"
                >
                  Annulla
                </button>
                <button
                  onClick={() => void salva()}
                  disabled={salvataggio}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {salvataggio ? 'Salvataggio…' : 'Salva'}
                </button>
              </>
            ) : (
              <button
                onClick={avviaModifica}
                title="Modifica i dati dell'immobile"
                className="flex items-center gap-1.5 rounded-lg border border-cielo-300 bg-panna px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-100"
              >
                <IconaMatita />
                Modifica
              </button>
            )}
          </span>
        </div>

        {errore && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* dati */}
          <dl className="grid gap-4 sm:grid-cols-2">
            {modifica ? (
              <>
                <Campo etichetta="Asset *" valore={form.asset} onCambia={(v) => setForm({ ...form, asset: v })} mono />
                <Campo
                  etichetta="Portafoglio"
                  valore={form.portafoglio}
                  onCambia={(v) => setForm({ ...form, portafoglio: v })}
                />
                <Campo
                  etichetta="Denominazione *"
                  valore={form.denominazione}
                  onCambia={(v) => setForm({ ...form, denominazione: v })}
                />
                <Campo
                  etichetta="Localizzazione"
                  valore={form.localizzazione}
                  onCambia={(v) => setForm({ ...form, localizzazione: v })}
                />
              </>
            ) : (
              <>
                <Dato etichetta="Asset" valore={dati?.asset ?? immobile.asset} mono />
                <Dato etichetta="Portafoglio" valore={dati?.portafoglio ?? ''} />
                <Dato etichetta="Denominazione" valore={dati?.denominazione ?? immobile.denominazione} />
                <Dato etichetta="Localizzazione" valore={localizzazione} />
              </>
            )}
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
                <Riquadro key={v.id} to={v.percorso} titolo={v.etichetta} desc={v.descrizione} icona={v.icona} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Campo({
  etichetta,
  valore,
  onCambia,
  mono,
}: {
  etichetta: string
  valore: string
  onCambia: (v: string) => void
  mono?: boolean
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</span>
      <input
        value={valore}
        onChange={(e) => onCambia(e.target.value)}
        className={`mt-1 w-full rounded-lg border border-cielo-300 bg-white px-3 py-1.5 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100 ${
          mono ? 'font-mono' : ''
        }`}
      />
    </label>
  )
}

function IconaMatita() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
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
function Riquadro({
  to,
  titolo,
  desc,
  icona,
}: {
  to?: string
  titolo: string
  desc?: string
  icona: NomeIcona
}) {
  const contenuto = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold text-cielo-800">
          <Icona nome={icona} size={18} />
          {titolo}
        </span>
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
    <Link
      to={to}
      className={`${base} group border-cielo-200 bg-panna hover:-translate-y-0.5 hover:border-cielo-400 hover:shadow-md`}
    >
      {contenuto}
      <span className="mt-2 flex items-center gap-1 text-xs font-medium text-cielo-500 opacity-0 transition group-hover:opacity-100">
        Apri <IconaFrecciaDestra />
      </span>
    </Link>
  ) : (
    <div className={`${base} cursor-default border-dashed border-cielo-200 bg-panna/60`}>{contenuto}</div>
  )
}

function IconaFrecciaDestra() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
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
