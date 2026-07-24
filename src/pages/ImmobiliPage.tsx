import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { supabase } from '../lib/supabase'
import type { Immobile } from '../lib/tipi'

const VUOTO = { asset: '', denominazione: '', portafoglio: '', localizzazione: '' }
type Campi = typeof VUOTO
type CampoOrdine = 'asset' | 'denominazione' | 'portafoglio' | 'localizzazione'
type Ordine = { campo: CampoOrdine; dir: 'asc' | 'desc' }

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
const inputSm =
  'w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-200'

export default function ImmobiliPage() {
  const [form, setForm] = useState<Campi>(VUOTO)
  const [immobili, setImmobili] = useState<Immobile[]>([])
  const [ordine, setOrdine] = useState<Ordine>({ campo: 'asset', dir: 'asc' })
  const [caricamento, setCaricamento] = useState(true)
  const [salvataggio, setSalvataggio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // modifica inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Campi>(VUOTO)
  const [editErrore, setEditErrore] = useState<string | null>(null)
  const [salvataggioMod, setSalvataggioMod] = useState(false)

  // eliminazione
  const [eliminaTarget, setEliminaTarget] = useState<Immobile | null>(null)
  const [eliminaErrore, setEliminaErrore] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)

  async function carica() {
    setCaricamento(true)
    const { data, error } = await supabase
      .from('immobili')
      .select('id, asset, denominazione, portafoglio, localizzazione, creato_il')
    if (!error && data) setImmobili(data as Immobile[])
    setCaricamento(false)
  }

  useEffect(() => {
    void carica()
  }, [])

  const portafogli = useMemo(
    () => Array.from(new Set(immobili.map((i) => i.portafoglio).filter(Boolean))).sort() as string[],
    [immobili],
  )

  const immobiliOrdinati = useMemo(() => {
    const arr = [...immobili]
    arr.sort((a, b) => {
      const va = (a[ordine.campo] ?? '') as string
      const vb = (b[ordine.campo] ?? '') as string
      const cmp = va.localeCompare(vb, 'it', { numeric: true, sensitivity: 'base' })
      return ordine.dir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [immobili, ordine])

  // Controllo duplicati lato client (l'unicità è comunque garantita dal DB).
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
    const { error } = await supabase.from('immobili').insert({
      asset: form.asset.trim(),
      denominazione: form.denominazione.trim(),
      portafoglio: form.portafoglio.trim() || null,
      localizzazione: form.localizzazione.trim() || null,
    })
    setSalvataggio(false)
    if (error) {
      setErrore(msgErrore(error))
      return
    }
    setOk(`Immobile "${form.denominazione.trim()}" salvato.`)
    setForm(VUOTO)
    void carica()
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
    const { error } = await supabase
      .from('immobili')
      .update({
        asset: editForm.asset.trim(),
        denominazione: editForm.denominazione.trim(),
        portafoglio: editForm.portafoglio.trim() || null,
        localizzazione: editForm.localizzazione.trim() || null,
      })
      .eq('id', editId)
    setSalvataggioMod(false)
    if (error) {
      setEditErrore(msgErrore(error))
      return
    }
    setEditId(null)
    void carica()
  }

  // ---- eliminazione ----
  async function confermaElimina() {
    if (!eliminaTarget) return
    setEliminaErrore(null)
    setEliminando(true)
    const { error } = await supabase.from('immobili').delete().eq('id', eliminaTarget.id)
    setEliminando(false)
    if (error) {
      setEliminaErrore(`Errore nell'eliminazione: ${error.message}`)
      return
    }
    setEliminaTarget(null)
    void carica()
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-bold text-slate-800">Inserimento Immobile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ogni immobile è identificato dal numero <b>Asset</b> (univoco; nei fogli attività compare anche
          come <b>COD. AGGREGATO</b>).
        </p>

        <form onSubmit={salva} className="mt-5 max-w-2xl rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Numero Asset *">
              <input
                value={form.asset}
                onChange={(e) => setForm((f) => ({ ...f, asset: e.target.value }))}
                placeholder="es. 0801"
                className={inputCls}
              />
            </Campo>
            <Campo label="Denominazione immobile *">
              <input
                value={form.denominazione}
                onChange={(e) => setForm((f) => ({ ...f, denominazione: e.target.value }))}
                placeholder="es. EX MT NAPOLI"
                className={inputCls}
              />
            </Campo>
            <Campo label="Portafoglio di appartenenza">
              <input
                list="portafogli"
                value={form.portafoglio}
                onChange={(e) => setForm((f) => ({ ...f, portafoglio: e.target.value }))}
                placeholder="es. CDP Imm in liq"
                className={inputCls}
              />
            </Campo>
            <Campo label="Localizzazione">
              <input
                value={form.localizzazione}
                onChange={(e) => setForm((f) => ({ ...f, localizzazione: e.target.value }))}
                placeholder="es. Napoli — Campania"
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
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-50"
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
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Pulisci
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Immobili inseriti {caricamento ? '' : `(${immobili.length})`}
        </h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-500">
                <ThOrdinabile label="Asset" campo="asset" ordine={ordine} setOrdine={setOrdine} />
                <ThOrdinabile label="Denominazione" campo="denominazione" ordine={ordine} setOrdine={setOrdine} />
                <ThOrdinabile label="Portafoglio" campo="portafoglio" ordine={ordine} setOrdine={setOrdine} />
                <ThOrdinabile label="Localizzazione" campo="localizzazione" ordine={ordine} setOrdine={setOrdine} />
                <th className="w-24 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {caricamento ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Caricamento…
                  </td>
                </tr>
              ) : immobili.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Nessun immobile inserito.
                  </td>
                </tr>
              ) : (
                immobiliOrdinati.map((i) =>
                  editId === i.id ? (
                    <Fragment key={i.id}>
                      <tr className="border-b bg-amber-50 last:border-0">
                        <td className="px-2 py-1.5">
                          <input
                            value={editForm.asset}
                            onChange={(e) => setEditForm((f) => ({ ...f, asset: e.target.value }))}
                            className={`${inputSm} font-mono`}
                          />
                        </td>
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
                              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
                            >
                              <IconaX />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editErrore && (
                        <tr className="bg-amber-50">
                          <td colSpan={5} className="px-4 pb-2 text-sm text-red-700">
                            {editErrore}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ) : (
                    <tr key={i.id} className="group border-b transition last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-slate-700">{i.asset}</td>
                      <td className="px-4 py-2 text-slate-800">{i.denominazione}</td>
                      <td className="px-4 py-2 text-slate-500">{i.portafoglio || '—'}</td>
                      <td className="px-4 py-2 text-slate-500">{i.localizzazione || '—'}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={() => avviaModifica(i)}
                            title="Modifica"
                            className="rounded p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
                          >
                            <IconaMatita />
                          </button>
                          <button
                            onClick={() => {
                              setEliminaErrore(null)
                              setEliminaTarget(i)
                            }}
                            title="Elimina"
                            className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
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
      </section>

      <datalist id="portafogli">
        {portafogli.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {eliminaTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !eliminando && setEliminaTarget(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                <IconaCestino />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Elimina immobile</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Stai per eliminare <b>{eliminaTarget.denominazione}</b> (Asset {eliminaTarget.asset}) e{' '}
                  <b>TUTTI i dati collegati</b> a questo asset (attività, incarichi, ecc.). L'operazione è{' '}
                  <b>irreversibile</b>.
                </p>
              </div>
            </div>
            {eliminaErrore && (
              <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{eliminaErrore}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEliminaTarget(null)}
                disabled={eliminando}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
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

function msgErrore(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'Esiste già un immobile con questo Asset o questa Denominazione.'
  return `Errore: ${error.message}`
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
        className={`flex select-none items-center gap-1 transition hover:text-slate-700 ${
          attivo ? 'text-slate-700' : ''
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
      <svg width="9" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={su ? 'text-amber-600' : 'text-slate-300'}>
        <path d="M1 5l4-4 4 4" />
      </svg>
      <svg width="9" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={giu ? 'text-amber-600' : 'text-slate-300'}>
        <path d="M1 1l4 4 4-4" />
      </svg>
    </span>
  )
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
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

function IconaX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
