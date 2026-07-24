import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Immobile } from '../lib/tipi'

const VUOTO = { asset: '', denominazione: '', portafoglio: '', localizzazione: '' }
type Campi = typeof VUOTO

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100'

export default function ImmobiliPage() {
  const [form, setForm] = useState<Campi>(VUOTO)
  const [immobili, setImmobili] = useState<Immobile[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [salvataggio, setSalvataggio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function carica() {
    setCaricamento(true)
    const { data, error } = await supabase
      .from('immobili')
      .select('id, asset, denominazione, portafoglio, localizzazione, creato_il')
      .order('denominazione')
    if (!error && data) setImmobili(data as Immobile[])
    setCaricamento(false)
  }

  useEffect(() => {
    void carica()
  }, [])

  const portafogli = useMemo(
    () => Array.from(new Set(immobili.map((i) => i.portafoglio).filter(Boolean))) as string[],
    [immobili],
  )

  function aggiorna(campo: keyof Campi, valore: string) {
    setForm((f) => ({ ...f, [campo]: valore }))
  }

  async function salva(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setOk(null)
    if (!form.asset.trim() || !form.denominazione.trim()) {
      setErrore('Numero Asset e Denominazione sono obbligatori.')
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
      setErrore(
        error.code === '23505'
          ? 'Esiste già un immobile con questo Asset o questa Denominazione.'
          : `Errore nel salvataggio: ${error.message}`,
      )
      return
    }
    setOk(`Immobile "${form.denominazione.trim()}" salvato.`)
    setForm(VUOTO)
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
                onChange={(e) => aggiorna('asset', e.target.value)}
                placeholder="es. 0801"
                className={inputCls}
              />
            </Campo>
            <Campo label="Denominazione immobile *">
              <input
                value={form.denominazione}
                onChange={(e) => aggiorna('denominazione', e.target.value)}
                placeholder="es. EX MT NAPOLI"
                className={inputCls}
              />
            </Campo>
            <Campo label="Portafoglio di appartenenza">
              <input
                list="portafogli"
                value={form.portafoglio}
                onChange={(e) => aggiorna('portafoglio', e.target.value)}
                placeholder="es. CDP RA SGR - FSA"
                className={inputCls}
              />
              <datalist id="portafogli">
                {portafogli.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Campo>
            <Campo label="Localizzazione">
              <input
                value={form.localizzazione}
                onChange={(e) => aggiorna('localizzazione', e.target.value)}
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
                <th className="px-4 py-2 font-medium">Asset</th>
                <th className="px-4 py-2 font-medium">Denominazione</th>
                <th className="px-4 py-2 font-medium">Portafoglio</th>
                <th className="px-4 py-2 font-medium">Localizzazione</th>
              </tr>
            </thead>
            <tbody>
              {caricamento ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Caricamento…
                  </td>
                </tr>
              ) : immobili.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Nessun immobile inserito.
                  </td>
                </tr>
              ) : (
                immobili.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-slate-700">{i.asset}</td>
                    <td className="px-4 py-2 text-slate-800">{i.denominazione}</td>
                    <td className="px-4 py-2 text-slate-500">{i.portafoglio || '—'}</td>
                    <td className="px-4 py-2 text-slate-500">{i.localizzazione || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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
