import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { dbLocale } from '../lib/db'
import { useSelezione } from '../hooks/useSelezione'
import { useImmobili } from '../hooks/useImmobili'
import { usePreferenze } from '../hooks/usePreferenze'
import type { Immobile } from '../lib/tipi'

const VUOTO = { asset: '', denominazione: '', portafoglio: '', localizzazione: '' }
type Campi = typeof VUOTO
type CampoOrdine = 'asset' | 'denominazione' | 'portafoglio' | 'localizzazione'
type Ordine = { campo: CampoOrdine; dir: 'asc' | 'desc' }

const inputCls =
  'w-full rounded-lg border border-cielo-300 bg-white px-3 py-2 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100'
const inputSm =
  'w-full rounded border border-cielo-300 bg-white px-2 py-1 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-1 focus:ring-cielo-200'

export default function ImmobiliPage() {
  const { immobile: selezionato, seleziona } = useSelezione()
  // quanti immobili per pagina: scelta ricordata nelle preferenze dell'utente
  const { perPagina, impostaPerPagina, modoMappa, impostaModoMappa } = usePreferenze()

  // elenco condiviso: le modifiche fatte qui si vedono subito anche altrove
  const { immobili, caricamento, inserisci, aggiorna, elimina } = useImmobili()
  const [form, setForm] = useState<Campi>(VUOTO)
  const [ordine, setOrdine] = useState<Ordine>({ campo: 'asset', dir: 'asc' })
  const [ricerca, setRicerca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [salvataggio, setSalvataggio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // modifica inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Campi>(VUOTO)
  const [editErrore, setEditErrore] = useState<string | null>(null)
  const [salvataggioMod, setSalvataggioMod] = useState(false)

  // eliminazione
  const [eliminaTarget, setEliminaTarget] = useState<Immobile | null>(null)
  const [eliminaErrore, setEliminaErrore] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)

  // mappa: se non c'è ancora una preferenza, la chiediamo al primo utilizzo
  const [mappaDaAprire, setMappaDaAprire] = useState<string | null>(null)

  // torna a pagina 1 quando cambia la ricerca o gli elementi per pagina
  useEffect(() => {
    setPagina(1)
  }, [ricerca, perPagina])

  // il toast di selezione sparisce da solo dopo 3 secondi
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(t)
  }, [toast])

  const portafogli = useMemo(
    () => Array.from(new Set(immobili.map((i) => i.portafoglio).filter(Boolean))).sort() as string[],
    [immobili],
  )

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase()
    if (q.length < 3) return immobili
    return immobili.filter(
      (i) =>
        (i.asset || '').toLowerCase().includes(q) ||
        (i.denominazione || '').toLowerCase().includes(q) ||
        (i.portafoglio || '').toLowerCase().includes(q) ||
        (i.localizzazione || '').toLowerCase().includes(q),
    )
  }, [immobili, ricerca])

  const ordinati = useMemo(() => {
    const arr = [...filtrati]
    arr.sort((a, b) => {
      const va = (a[ordine.campo] ?? '') as string
      const vb = (b[ordine.campo] ?? '') as string
      const cmp = va.localeCompare(vb, 'it', { numeric: true, sensitivity: 'base' })
      return ordine.dir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtrati, ordine])

  const totalePagine = Math.max(1, Math.ceil(ordinati.length / perPagina))
  const paginaCorrente = Math.min(pagina, totalePagine)
  const visibili = ordinati.slice((paginaCorrente - 1) * perPagina, paginaCorrente * perPagina)

  function duplicato(asset: string, den: string, escludiId?: string): string | null {
    const a = asset.trim().toLowerCase()
    const d = den.trim().toLowerCase()
    for (const im of immobili) {
      if (im.id === escludiId) continue
      if (im.asset.toLowerCase() === a) return `Esiste già un immobile con Asset "${asset.trim()}".`
      if (im.denominazione.toLowerCase() === d) return `Esiste già un immobile con Denominazione "${den.trim()}".`
    }
    return null
  }

  /** Apre la localizzazione in Google Maps; se manca la preferenza, prima la chiede. */
  function apriMappa(localizzazione: string) {
    if (!modoMappa) {
      setMappaDaAprire(localizzazione)
      return
    }
    void dbLocale.mappa.apri(localizzazione, modoMappa)
  }

  /** Scelta fatta nella finestra: salva la preferenza e apre subito la mappa. */
  function scegliModoEApri(modo: 'finestra' | 'browser') {
    const dove = mappaDaAprire
    impostaModoMappa(modo)
    setMappaDaAprire(null)
    if (dove) void dbLocale.mappa.apri(dove, modo)
  }

  // seleziona l'immobile: aggiorna header, mostra toast e riporta in cima
  function selezionaImmobile(i: Immobile) {
    seleziona({ id: i.id, asset: i.asset, denominazione: i.denominazione })
    setToast(`Immobile selezionato: ${i.denominazione}`)
    scorriInCima()
  }

  // ---- inserimento ----
  async function salva(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setOk(null)
    if (!form.asset.trim() || !form.denominazione.trim()) {
      setErrore('Numero Asset e Denominazione sono obbligatori.')
      return
    }
    const dup = duplicato(form.asset, form.denominazione)
    if (dup) {
      setErrore(dup)
      return
    }
    setSalvataggio(true)
    const esito = await inserisci({
      asset: form.asset.trim(),
      denominazione: form.denominazione.trim(),
      portafoglio: form.portafoglio.trim() || null,
      localizzazione: form.localizzazione.trim() || null,
    })
    setSalvataggio(false)
    if (!esito.ok) {
      setErrore(msgErrore({ code: esito.codice, message: esito.messaggio ?? '' }))
      return
    }
    setOk(`Immobile "${form.denominazione.trim()}" salvato.`)
    setForm(VUOTO)
  }

  // ---- modifica ----
  function avviaModifica(im: Immobile) {
    setEditErrore(null)
    setEditId(im.id)
    setEditForm({
      asset: im.asset,
      denominazione: im.denominazione,
      portafoglio: im.portafoglio ?? '',
      localizzazione: im.localizzazione ?? '',
    })
  }

  function annullaModifica() {
    setEditId(null)
    setEditErrore(null)
  }

  async function salvaModifica() {
    if (!editId) return
    setEditErrore(null)
    if (!editForm.asset.trim() || !editForm.denominazione.trim()) {
      setEditErrore('Numero Asset e Denominazione sono obbligatori.')
      return
    }
    const dup = duplicato(editForm.asset, editForm.denominazione, editId)
    if (dup) {
      setEditErrore(dup)
      return
    }
    setSalvataggioMod(true)
    const esito = await aggiorna(editId, {
      asset: editForm.asset.trim(),
      denominazione: editForm.denominazione.trim(),
      portafoglio: editForm.portafoglio.trim() || null,
      localizzazione: editForm.localizzazione.trim() || null,
    })
    setSalvataggioMod(false)
    if (!esito.ok) {
      setEditErrore(msgErrore({ code: esito.codice, message: esito.messaggio ?? '' }))
      return
    }
    // se stavo modificando l'immobile selezionato, aggiorno l'etichetta in header
    if (selezionato && selezionato.id === editId) {
      seleziona({ id: editId, asset: editForm.asset.trim(), denominazione: editForm.denominazione.trim() })
    }
    setEditId(null)
  }

  // ---- eliminazione ----
  async function confermaElimina() {
    if (!eliminaTarget) return
    setEliminaErrore(null)
    setEliminando(true)
    const esito = await elimina(eliminaTarget.id)
    setEliminando(false)
    if (!esito.ok) {
      setEliminaErrore(`Errore nell'eliminazione: ${esito.messaggio}`)
      return
    }
    if (selezionato && selezionato.id === eliminaTarget.id) seleziona(null)
    setEliminaTarget(null)
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-bold text-cielo-800">Inserisci/Seleziona Immobile</h1>
        <p className="mt-1 text-sm text-cielo-600">
          Ogni immobile è identificato dal numero <b>Asset</b> (univoco; nei fogli attività compare anche
          come <b>COD. AGGREGATO</b>).
        </p>

        <form onSubmit={salva} className="mt-5 max-w-2xl rounded-xl border border-cielo-200 bg-panna p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Numero Asset *">
              <input
                value={form.asset}
                onChange={(e) => setForm((f) => ({ ...f, asset: e.target.value }))}
                placeholder="es. 1234"
                className={inputCls}
              />
            </Campo>
            <Campo label="Denominazione immobile *">
              <input
                value={form.denominazione}
                onChange={(e) => setForm((f) => ({ ...f, denominazione: e.target.value }))}
                placeholder="es. IMMOBILE DI VIA ROMA"
                className={inputCls}
              />
            </Campo>
            <Campo label="Portafoglio di appartenenza">
              <input
                list="portafogli"
                value={form.portafoglio}
                onChange={(e) => setForm((f) => ({ ...f, portafoglio: e.target.value }))}
                placeholder="es. Portafoglio principale"
                className={inputCls}
              />
            </Campo>
            <Campo label="Localizzazione">
              <input
                value={form.localizzazione}
                onChange={(e) => setForm((f) => ({ ...f, localizzazione: e.target.value }))}
                placeholder="es. Roma, Via Cassia 100"
                className={inputCls}
              />
            </Campo>
          </div>

          {errore && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
          {ok && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</p>}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={salvataggio}
              className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
            >
              {salvataggio ? 'Salvataggio…' : 'Salva immobile'}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(VUOTO)
                setErrore(null)
                setOk(null)
              }}
              className="text-sm text-cielo-500 hover:text-cielo-800"
            >
              Pulisci
            </button>
          </div>
        </form>
      </section>

      <section>
        {/* barra strumenti: ricerca + elementi per pagina */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-md">
            <IconaLente />
            <input
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              placeholder="Cerca (min 3 caratteri) in asset, denominazione, portafoglio, localizzazione…"
              className="w-full rounded-lg border border-cielo-300 bg-white py-2 pl-9 pr-3 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-cielo-600">
            Mostra per pagina:
            <select
              value={perPagina}
              onChange={(e) => impostaPerPagina(Number(e.target.value))}
              className="rounded-lg border border-cielo-300 bg-white px-2 py-1.5 text-sm text-cielo-800 outline-none focus:border-cielo-400"
            >
              {[10, 20, 30, 40, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-cielo-200 bg-panna">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cielo-200 bg-cielo-50 text-left text-cielo-600">
                <ThOrdinabile label="Asset" campo="asset" ordine={ordine} setOrdine={setOrdine} />
                <th className="w-8 px-1 py-2" />
                <ThOrdinabile label="Denominazione" campo="denominazione" ordine={ordine} setOrdine={setOrdine} />
                <ThOrdinabile label="Portafoglio" campo="portafoglio" ordine={ordine} setOrdine={setOrdine} />
                <ThOrdinabile label="Localizzazione" campo="localizzazione" ordine={ordine} setOrdine={setOrdine} />
                <th className="w-8 px-1 py-2" />
                <th className="w-24 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {caricamento ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-cielo-400">
                    Caricamento…
                  </td>
                </tr>
              ) : ordinati.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-cielo-400">
                    {ricerca.trim().length >= 3 ? 'Nessun risultato per la ricerca.' : 'Nessun immobile inserito.'}
                  </td>
                </tr>
              ) : (
                visibili.map((i) =>
                  editId === i.id ? (
                    <Fragment key={i.id}>
                      <tr className="border-b border-cielo-200 bg-cielo-50 last:border-0">
                        <td className="px-2 py-1.5">
                          <input
                            value={editForm.asset}
                            onChange={(e) => setEditForm((f) => ({ ...f, asset: e.target.value }))}
                            className={`${inputSm} font-mono`}
                          />
                        </td>
                        <td className="px-1 py-1.5" />
                        <td className="px-2 py-1.5">
                          <input
                            value={editForm.denominazione}
                            onChange={(e) => setEditForm((f) => ({ ...f, denominazione: e.target.value }))}
                            className={inputSm}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            list="portafogli"
                            value={editForm.portafoglio}
                            onChange={(e) => setEditForm((f) => ({ ...f, portafoglio: e.target.value }))}
                            className={inputSm}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={editForm.localizzazione}
                            onChange={(e) => setEditForm((f) => ({ ...f, localizzazione: e.target.value }))}
                            className={inputSm}
                          />
                        </td>
                        <td className="px-1 py-1.5" />
                        <td className="px-2 py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => void salvaModifica()}
                              disabled={salvataggioMod}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {salvataggioMod ? '…' : 'Salva'}
                            </button>
                            <button
                              onClick={annullaModifica}
                              title="Annulla"
                              className="rounded p-1.5 text-cielo-400 transition hover:bg-cielo-200 hover:text-cielo-700"
                            >
                              <IconaX />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editErrore && (
                        <tr className="bg-cielo-50">
                          <td colSpan={7} className="px-4 pb-2 text-sm text-red-700">
                            {editErrore}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ) : (
                    <tr
                      key={i.id}
                      className={`group border-b border-cielo-100 transition last:border-0 ${
                        selezionato?.id === i.id ? 'bg-cielo-100' : 'hover:bg-cielo-50'
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-cielo-800">{i.asset}</td>
                      <td className="px-1 py-2 text-center">
                        <button
                          onClick={() => selezionaImmobile(i)}
                          title="Seleziona immobile"
                          className={`rounded p-1 transition ${
                            selezionato?.id === i.id
                              ? 'text-cielo-600'
                              : 'text-cielo-500 opacity-0 hover:bg-cielo-100 group-hover:opacity-100'
                          }`}
                        >
                          <IconaManina />
                        </button>
                      </td>
                      <td className="px-4 py-2 text-cielo-800">{i.denominazione}</td>
                      <td className="px-4 py-2 text-cielo-600">{i.portafoglio || '—'}</td>
                      <td className="px-4 py-2 text-cielo-600">{i.localizzazione || '—'}</td>
                      <td className="px-1 py-2 text-center">
                        {i.localizzazione && (
                          <button
                            onClick={() => apriMappa(i.localizzazione as string)}
                            title={`Apri in Google Maps: ${i.localizzazione}`}
                            className="rounded p-1 text-cielo-500 transition hover:bg-cielo-100 hover:text-cielo-700"
                          >
                            <IconaMappamondo />
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={() => avviaModifica(i)}
                            title="Modifica"
                            className="rounded p-1.5 text-cielo-400 transition hover:bg-amber-50 hover:text-amber-600"
                          >
                            <IconaMatita />
                          </button>
                          <button
                            onClick={() => {
                              setEliminaErrore(null)
                              setEliminaTarget(i)
                            }}
                            title="Elimina"
                            className="rounded p-1.5 text-cielo-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <IconaCestino />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>

        {/* piè di tabella: conteggio + paginazione */}
        {!caricamento && ordinati.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-cielo-600">
            <span>
              {ordinati.length} immobili{ricerca.trim().length >= 3 ? ' trovati' : ''} · pagina {paginaCorrente} di{' '}
              {totalePagine}
            </span>
            <div className="flex items-center gap-1">
              <BtnPagina disabilitato={paginaCorrente <= 1} onClick={() => setPagina(paginaCorrente - 1)}>
                ‹ Prec
              </BtnPagina>
              <BtnPagina disabilitato={paginaCorrente >= totalePagine} onClick={() => setPagina(paginaCorrente + 1)}>
                Succ ›
              </BtnPagina>
            </div>
          </div>
        )}
      </section>

      {/* --- prima apertura mappa: scelta (viene salvata nelle preferenze) --- */}
      {mappaDaAprire && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4"
          onClick={() => setMappaDaAprire(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-cielo-800">Dove vuoi aprire la mappa?</h3>
            <p className="mt-2 text-sm text-cielo-700">
              Scegli come aprire <b>{mappaDaAprire}</b> su Google Maps. La scelta viene ricordata e resta
              modificabile in <b>Utenti › Preferenze</b>.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => scegliModoEApri('finestra')}
                className="rounded-xl border border-cielo-300 bg-white p-4 text-left transition hover:border-cielo-400 hover:bg-cielo-50"
              >
                <span className="block font-medium text-cielo-800">Nella finestra dell'app</span>
                <span className="mt-1 block text-xs text-cielo-600">
                  Finestra ridimensionabile con la sola mappa navigabile.
                </span>
              </button>
              <button
                onClick={() => scegliModoEApri('browser')}
                className="rounded-xl border border-cielo-300 bg-white p-4 text-left transition hover:border-cielo-400 hover:bg-cielo-50"
              >
                <span className="block font-medium text-cielo-800">Nel browser</span>
                <span className="mt-1 block text-xs text-cielo-600">
                  Apre Google Maps completo nel browser predefinito.
                </span>
              </button>
            </div>
            <div className="mt-5 text-right">
              <button
                onClick={() => setMappaDaAprire(null)}
                className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-cielo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
            <IconaCheck />
            {toast}
          </div>
        </div>
      )}

      <datalist id="portafogli">
        {portafogli.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {eliminaTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4"
          onClick={() => !eliminando && setEliminaTarget(null)}
        >
          <div className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <IconaCestino />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-cielo-800">Elimina immobile</h3>
                <p className="mt-2 text-sm text-cielo-700">
                  Stai per eliminare <b>{eliminaTarget.denominazione}</b> (Asset {eliminaTarget.asset}) e{' '}
                  <b>TUTTI i dati collegati</b> a questo asset (attività, incarichi, ecc.). L'operazione è{' '}
                  <b>irreversibile</b>.
                </p>
              </div>
            </div>
            {eliminaErrore && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{eliminaErrore}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEliminaTarget(null)}
                disabled={eliminando}
                className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
              >
                Annulla
              </button>
              <button
                onClick={() => void confermaElimina()}
                disabled={eliminando}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {eliminando ? 'Eliminazione…' : 'Elimina definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Riporta in cima l'area dei contenuti (che scorre al posto della finestra). */
function scorriInCima() {
  const riquadro = document.getElementById('contenuto')
  if (riquadro) riquadro.scrollTo({ top: 0, behavior: 'smooth' })
  else window.scrollTo({ top: 0, behavior: 'smooth' })
}

function msgErrore(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'Esiste già un immobile con questo Asset o questa Denominazione.'
  return `Errore: ${error.message}`
}

function BtnPagina({
  children,
  onClick,
  disabilitato,
}: {
  children: ReactNode
  onClick: () => void
  disabilitato?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabilitato}
      className="rounded-lg border border-cielo-300 bg-white px-3 py-1.5 text-cielo-700 transition hover:bg-cielo-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function ThOrdinabile({
  label,
  campo,
  ordine,
  setOrdine,
}: {
  label: string
  campo: CampoOrdine
  ordine: Ordine
  setOrdine: Dispatch<SetStateAction<Ordine>>
}) {
  const attivo = ordine.campo === campo
  return (
    <th className="px-4 py-2 font-medium">
      <button
        type="button"
        onClick={() =>
          setOrdine((o) => ({ campo, dir: o.campo === campo && o.dir === 'asc' ? 'desc' : 'asc' }))
        }
        className={`flex select-none items-center gap-1 transition hover:text-cielo-800 ${
          attivo ? 'text-cielo-800' : ''
        }`}
      >
        {label}
        <FrecceOrdine attivo={attivo} dir={ordine.dir} />
      </button>
    </th>
  )
}

function FrecceOrdine({ attivo, dir }: { attivo: boolean; dir: 'asc' | 'desc' }) {
  const su = attivo && dir === 'asc'
  const giu = attivo && dir === 'desc'
  return (
    <span className="ml-0.5 inline-flex flex-col leading-[0]">
      <svg width="9" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={su ? 'text-cielo-600' : 'text-cielo-300'}>
        <path d="M1 5l4-4 4 4" />
      </svg>
      <svg width="9" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={giu ? 'text-cielo-600' : 'text-cielo-300'}>
        <path d="M1 1l4 4 4-4" />
      </svg>
    </span>
  )
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-cielo-700">{label}</span>
      {children}
    </label>
  )
}

function IconaLente() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cielo-400"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function IconaMappamondo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function IconaManina() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 14a8 8 0 0 1-8 8" />
      <path d="M18 11v-1a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M14 10V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1" />
      <path d="M10 9.5V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v10" />
      <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  )
}

function IconaMatita() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconaCestino() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function IconaCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IconaX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
