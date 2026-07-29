import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import { useSelezione } from '../hooks/useSelezione'
import { useToast } from '../hooks/useToast'
import { useImmobili } from '../hooks/useImmobili'
import { BIMESTRI, MESI_BREVI, STATI_AUTORIZZAZIONE, datiBMVuoti } from '../lib/tipi'
import type { BimestreBM, DatiBM } from '../lib/tipi'

type Salvataggio = 'fermo' | 'in-corso' | 'salvato'

const ANNO_CORRENTE = new Date().getFullYear()

export default function BuildingManagerPage() {
  const { immobile } = useSelezione()
  const { immobili } = useImmobili()
  const toast = useToast()
  const dati = immobili.find((i) => i.id === immobile?.id) ?? null

  const [anno, setAnno] = useState(ANNO_CORRENTE)
  const [campi, setCampi] = useState<DatiBM>(datiBMVuoti)
  const [anni, setAnni] = useState<number[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [stato, setStato] = useState<Salvataggio>('fermo')
  const [errore, setErrore] = useState<string | null>(null)

  // il salvataggio parte da solo poco dopo l'ultima modifica
  const attesaSalvataggio = useRef<number | undefined>(undefined)
  const daSalvare = useRef(false)

  const immobileId = immobile?.id ?? ''

  // caricamento dell'incarico dell'anno scelto
  useEffect(() => {
    if (!immobileId) return
    let vivo = true
    setCaricamento(true)
    daSalvare.current = false
    window.clearTimeout(attesaSalvataggio.current)
    void dbLocale.bm.get(immobileId, anno).then(({ data }) => {
      if (!vivo) return
      setCampi(data ? estraiCampi(data) : datiBMVuoti())
      setCaricamento(false)
      setStato('fermo')
    })
    return () => {
      vivo = false
    }
  }, [immobileId, anno])

  // elenco degli anni già compilati, per il selettore
  useEffect(() => {
    if (!immobileId) return
    let vivo = true
    void dbLocale.bm.anni(immobileId).then(({ data }) => {
      if (vivo) setAnni(data ?? [])
    })
    return () => {
      vivo = false
    }
  }, [immobileId, stato])

  function modifica(cambio: Partial<DatiBM>) {
    setCampi((c) => {
      const nuovo = { ...c, ...cambio }
      programmaSalvataggio(nuovo)
      return nuovo
    })
  }

  function modificaBimestre(indice: number, cambio: Partial<BimestreBM>) {
    setCampi((c) => {
      const bimestri = c.bimestri.map((b, i) => (i === indice ? { ...b, ...cambio } : b))
      const nuovo = { ...c, bimestri }
      programmaSalvataggio(nuovo)
      return nuovo
    })
  }

  function programmaSalvataggio(valori: DatiBM) {
    if (!immobileId) return
    daSalvare.current = true
    setStato('in-corso')
    window.clearTimeout(attesaSalvataggio.current)
    attesaSalvataggio.current = window.setTimeout(() => void salva(valori), 700)
  }

  async function salva(valori: DatiBM) {
    setErrore(null)
    const { error } = await dbLocale.bm.salva(immobileId, anno, valori)
    daSalvare.current = false
    if (error) {
      setErrore(error.message)
      toast.errore(`Incarico non salvato: ${error.message}`)
      setStato('fermo')
      return
    }
    setStato('salvato')
  }

  // se si lascia la pagina con modifiche in sospeso, si salva subito
  useEffect(() => {
    return () => {
      if (daSalvare.current) {
        window.clearTimeout(attesaSalvataggio.current)
        void dbLocale.bm.salva(immobileId, anno, campiCorrenti.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immobileId, anno])

  const campiCorrenti = useRef(campi)
  campiCorrenti.current = campi

  // la regione è quella salvata sull'immobile (modificabile dalla sua scheda)
  const regione = dati?.regione?.trim() || null
  const totaleBimestri = campi.bimestri.reduce((s, b) => s + (b.importo ?? 0), 0)
  const reportConsegnati = campi.report.filter(Boolean).length
  const anniElenco = Array.from(new Set([ANNO_CORRENTE, ANNO_CORRENTE + 1, ANNO_CORRENTE - 1, ...anni])).sort(
    (a, b) => b - a,
  )

  if (!immobile) return <Navigate to="/immobili" replace />

  return (
    <div className="space-y-6">
      {/* ---------- intestazione ---------- */}
      <section className="rounded-2xl border border-cielo-200 bg-cielo-50 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-cielo-800">
            Building Manager: <span className="text-cielo-600">{dati?.denominazione ?? immobile.denominazione}</span>
          </h1>
          <span className="rounded-full border border-cielo-300 bg-panna px-2.5 py-1 font-mono text-xs text-cielo-700">
            Asset {dati?.asset ?? immobile.asset}
          </span>
          {regione && (
            <span
              className="rounded-full border border-cielo-300 bg-panna px-2.5 py-1 text-xs text-cielo-700"
              title="Regione dedotta dalla localizzazione dell'immobile"
            >
              {regione}
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            <SpiaSalvataggio stato={stato} />
            <label className="flex items-center gap-2 text-sm text-cielo-700">
              Anno
              <select
                value={anno}
                onChange={(e) => setAnno(Number(e.target.value))}
                className="rounded-lg border border-cielo-300 bg-white px-2 py-1 text-sm text-cielo-800 outline-none focus:border-cielo-400"
              >
                {anniElenco.map((a) => (
                  <option key={a} value={a}>
                    {a}
                    {anni.includes(a) ? ' ●' : ''}
                  </option>
                ))}
              </select>
            </label>
          </span>
        </div>
        {dati?.localizzazione && (
          <p className="mt-2 text-sm text-cielo-600">
            {dati.localizzazione}
            {!regione && <span className="ml-2 text-xs text-cielo-400">(regione non riconosciuta dall'indirizzo)</span>}
          </p>
        )}
        {errore && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
      </section>

      {caricamento ? (
        <p className="text-sm text-cielo-500">Caricamento…</p>
      ) : (
        <>
          {/* ---------- incarico ---------- */}
          <section className="rounded-2xl border border-cielo-200 bg-panna p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">Incarico {anno}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo
                etichetta="Fornitore"
                valore={campi.fornitore}
                onCambia={(v) => modifica({ fornitore: v })}
                suggerimenti="fornitori-bm"
              />
              <Campo
                etichetta="Nominativo BM"
                valore={campi.nominativo}
                onCambia={(v) => modifica({ nominativo: v })}
              />
              <Campo etichetta="Recapito" valore={campi.recapito} onCambia={(v) => modifica({ recapito: v })} />
              <Scelta
                etichetta="Categoria"
                valore={campi.categoria}
                opzioni={['A', 'B', 'C']}
                onCambia={(v) => modifica({ categoria: v })}
              />
              <Campo
                etichetta="Incarico dal"
                tipo="date"
                valore={campi.periodo_dal}
                onCambia={(v) => modifica({ periodo_dal: v })}
              />
              <Campo
                etichetta="Incarico al"
                tipo="date"
                valore={campi.periodo_al}
                onCambia={(v) => modifica({ periodo_al: v })}
              />
              <Campo
                etichetta="Fabbisogno netto (12 mesi)"
                tipo="number"
                valore={campi.fabbisogno === null ? '' : String(campi.fabbisogno)}
                onCambia={(v) => modifica({ fabbisogno: v === null ? null : Number(v) })}
                suffisso="€"
              />
              <Campo
                etichetta={`Call off ${anno}`}
                valore={campi.call_off}
                onCambia={(v) => modifica({ call_off: v })}
                mono
              />
            </div>
          </section>

          {/* ---------- report mensili ---------- */}
          <section className="rounded-2xl border border-cielo-200 bg-panna p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">
                Consegna report mensile
              </h2>
              <span className="text-xs text-cielo-500">{reportConsegnati} su 12 consegnati</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {MESI_BREVI.map((mese, i) => {
                const consegnato = campi.report[i]
                return (
                  <button
                    key={mese}
                    onClick={() =>
                      modifica({ report: campi.report.map((v, j) => (j === i ? !v : v)) })
                    }
                    title={consegnato ? `${mese}: consegnato` : `${mese}: da consegnare`}
                    className={`h-12 w-16 rounded-lg border text-sm font-medium transition ${
                      consegnato
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-cielo-200 bg-white text-cielo-500 hover:border-cielo-400'
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-wide">{mese}</span>
                    <span className="block text-base leading-none">{consegnato ? '✓' : '—'}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ---------- bimestri ---------- */}
          <section className="rounded-2xl border border-cielo-200 bg-panna p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">
                Ripartizione della spesa per bimestri
              </h2>
              <span className="text-xs text-cielo-500">
                Totale bimestri: <b className="text-cielo-700">{euro(totaleBimestri)}</b>
                {campi.fabbisogno !== null && <> su fabbisogno {euro(campi.fabbisogno)}</>}
              </span>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-cielo-200 text-left text-xs uppercase tracking-wide text-cielo-500">
                    <th className="px-2 py-2 font-semibold">Bimestre</th>
                    <th className="px-2 py-2 font-semibold">ID BEM</th>
                    <th className="px-2 py-2 font-semibold">Importo</th>
                    <th className="px-2 py-2 font-semibold">Allegati GRECA-CAP</th>
                    <th className="px-2 py-2 font-semibold">Autorizzazione fatturazione</th>
                  </tr>
                </thead>
                <tbody>
                  {BIMESTRI.map((b, i) => (
                    <tr key={b.n} className="border-b border-cielo-100 last:border-0">
                      <td className="whitespace-nowrap px-2 py-2 text-cielo-700">
                        <b>{b.n}°</b> <span className="text-xs text-cielo-500">({b.mesi})</span>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={campi.bimestri[i].idBem ?? ''}
                          onChange={(e) => modificaBimestre(i, { idBem: e.target.value || null })}
                          className={`${inputCella} font-mono`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={campi.bimestri[i].importo ?? ''}
                          onChange={(e) =>
                            modificaBimestre(i, { importo: e.target.value === '' ? null : Number(e.target.value) })
                          }
                          className={`${inputCella} w-28 text-right`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={campi.bimestri[i].allegati ?? ''}
                          onChange={(e) => modificaBimestre(i, { allegati: e.target.value || null })}
                          className={inputCella}
                        >
                          <option value="">—</option>
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <SceltaAutorizzazione
                          valore={campi.bimestri[i].autorizzazione}
                          onCambia={(v) => modificaBimestre(i, { autorizzazione: v })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- semestri e svincolo ---------- */}
          <section className="rounded-2xl border border-cielo-200 bg-panna p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">
              Stati di servizio e svincolo
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Campo etichetta="SDS 1° semestre" valore={campi.sds1} onCambia={(v) => modifica({ sds1: v })} />
              <Campo etichetta="SDS 2° semestre" valore={campi.sds2} onCambia={(v) => modifica({ sds2: v })} />
              <Campo
                etichetta="ID BEM svincolo 10%"
                valore={campi.svincolo_id}
                onCambia={(v) => modifica({ svincolo_id: v })}
                mono
              />
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-cielo-500">
                  Autorizz. svincolo
                </span>
                <span className="mt-1 block">
                  <SceltaAutorizzazione
                    valore={campi.svincolo_aut}
                    onCambia={(v) => modifica({ svincolo_aut: v })}
                    grande
                  />
                </span>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-cielo-500">Note</span>
              <textarea
                value={campi.note ?? ''}
                onChange={(e) => modifica({ note: e.target.value || null })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-cielo-300 bg-white px-3 py-2 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100"
              />
            </label>
          </section>

          <p className="text-xs text-cielo-500">
            Le modifiche si salvano da sole.{' '}
            <Link to="/immobile" className="underline hover:text-cielo-700">
              Torna alla scheda dell'immobile
            </Link>
          </p>
        </>
      )}

      {/* suggerimenti: restano scrivibili a mano, non sono un elenco chiuso */}
      <datalist id="stati-autorizzazione">
        {STATI_AUTORIZZAZIONE.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <ElencoFornitori />
    </div>
  )
}

const inputCella =
  'w-full rounded border border-cielo-300 bg-white px-2 py-1 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-1 focus:ring-cielo-200'

function euro(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
}

/** I campi salvati, senza identità e senza data di aggiornamento. */
function estraiCampi(r: {
  fornitore: string | null
  nominativo: string | null
  recapito: string | null
  categoria: string | null
  periodo_dal: string | null
  periodo_al: string | null
  fabbisogno: number | null
  call_off: string | null
  report: boolean[]
  bimestri: BimestreBM[]
  sds1: string | null
  sds2: string | null
  svincolo_id: string | null
  svincolo_aut: string | null
  note: string | null
}): DatiBM {
  const vuoto = datiBMVuoti()
  return {
    fornitore: r.fornitore,
    nominativo: r.nominativo,
    recapito: r.recapito,
    categoria: r.categoria,
    periodo_dal: r.periodo_dal,
    periodo_al: r.periodo_al,
    fabbisogno: r.fabbisogno,
    call_off: r.call_off,
    report: Array.from({ length: 12 }, (_, i) => Boolean(r.report?.[i])),
    bimestri: vuoto.bimestri.map((b, i) => ({ ...b, ...(r.bimestri?.[i] ?? {}) })),
    sds1: r.sds1,
    sds2: r.sds2,
    svincolo_id: r.svincolo_id,
    svincolo_aut: r.svincolo_aut,
    note: r.note,
  }
}

/** Suggerimenti per il fornitore: i nomi già usati negli altri immobili. */
function ElencoFornitori() {
  const [nomi, setNomi] = useState<string[]>([])

  useEffect(() => {
    let vivo = true
    void dbLocale.bm.fornitori().then(({ data }) => {
      if (vivo) setNomi(data ?? [])
    })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <datalist id="fornitori-bm">
      {nomi.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  )
}

/**
 * Autorizzazione alla fatturazione: si scrive quel che serve. "ok" e "inviare"
 * sono lì come suggerimento e si colorano da soli; qualsiasi altro testo
 * (compreso un importo) è ammesso.
 */
function SceltaAutorizzazione({
  valore,
  onCambia,
  grande,
}: {
  valore: string | null
  onCambia: (v: string | null) => void
  grande?: boolean
}) {
  const attuale = valore ?? ''
  const normale = attuale.trim().toLowerCase()
  const colore =
    normale === 'ok'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
      : normale === 'inviare'
        ? 'border-amber-300 bg-amber-50 text-amber-800'
        : 'border-cielo-300 bg-white text-cielo-800'

  return (
    <input
      list="stati-autorizzazione"
      value={attuale}
      onChange={(e) => onCambia(e.target.value || null)}
      placeholder="ok, inviare, …"
      className={`w-full rounded border px-2 text-sm outline-none transition focus:border-cielo-400 focus:ring-1 focus:ring-cielo-200 ${colore} ${
        grande ? 'rounded-lg py-1.5' : 'py-1'
      }`}
    />
  )
}

function SpiaSalvataggio({ stato }: { stato: Salvataggio }) {
  if (stato === 'fermo') return null
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        stato === 'in-corso' ? 'bg-cielo-100 text-cielo-600' : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      {stato === 'in-corso' ? 'salvataggio…' : 'salvato ✓'}
    </span>
  )
}

function Campo({
  etichetta,
  valore,
  onCambia,
  tipo = 'text',
  mono,
  suffisso,
  suggerimenti,
}: {
  etichetta: string
  valore: string | null
  onCambia: (v: string | null) => void
  tipo?: 'text' | 'date' | 'number'
  mono?: boolean
  suffisso?: string
  suggerimenti?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <input
          type={tipo}
          list={suggerimenti}
          value={valore ?? ''}
          onChange={(e) => onCambia(e.target.value === '' ? null : e.target.value)}
          className={`w-full rounded-lg border border-cielo-300 bg-white px-3 py-1.5 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100 ${
            mono ? 'font-mono' : ''
          }`}
        />
        {suffisso && <span className="shrink-0 text-sm text-cielo-500">{suffisso}</span>}
      </span>
    </label>
  )
}

function Scelta({
  etichetta,
  valore,
  opzioni,
  onCambia,
}: {
  etichetta: string
  valore: string | null
  opzioni: string[]
  onCambia: (v: string | null) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</span>
      <select
        value={valore ?? ''}
        onChange={(e) => onCambia(e.target.value === '' ? null : e.target.value)}
        className="mt-1 w-full rounded-lg border border-cielo-300 bg-white px-3 py-1.5 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100"
      >
        <option value="">—</option>
        {opzioni.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
