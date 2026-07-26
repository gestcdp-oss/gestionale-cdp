import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import type { Utente } from '../lib/db'
import { useAuth } from '../hooks/useAuth'
import { usePreferenze } from '../hooks/usePreferenze'

const inputCls =
  'w-full rounded-lg border border-cielo-300 bg-white px-3 py-2 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100'
const inputSm =
  'w-full rounded border border-cielo-300 bg-white px-2 py-1 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-1 focus:ring-cielo-200'

const NUOVO = { nome: '', cognome: '', email: '', password: '', ripeti: '', ruolo: 'utente' as 'utente' | 'admin' }

export default function UtentiPage() {
  const { utente, cambiaPassword, ricarica } = useAuth()
  const { modoMappa, impostaModoMappa } = usePreferenze()
  const admin = utente?.ruolo === 'admin'

  const [utenti, setUtenti] = useState<Utente[]>([])
  const [caricamento, setCaricamento] = useState(true)

  // profilo personale
  const [profilo, setProfilo] = useState({ nome: '', cognome: '', email: '' })
  const [profErrore, setProfErrore] = useState<string | null>(null)
  const [profOk, setProfOk] = useState<string | null>(null)

  // cambio password personale
  const [apriPwd, setApriPwd] = useState(false)
  const [pwd, setPwd] = useState({ vecchia: '', nuova: '', ripeti: '' })
  const [pwdErrore, setPwdErrore] = useState<string | null>(null)
  const [pwdOk, setPwdOk] = useState<string | null>(null)

  // nuovo utente (solo amministratori)
  const [nuovo, setNuovo] = useState(NUOVO)
  const [nuovoErrore, setNuovoErrore] = useState<string | null>(null)
  const [nuovoOk, setNuovoOk] = useState<string | null>(null)

  // modifica inline + azioni sugli altri utenti
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ nome: '', cognome: '', email: '', ruolo: 'utente' as 'utente' | 'admin' })
  const [editErrore, setEditErrore] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<Utente | null>(null)
  const [resetPwd, setResetPwd] = useState({ nuova: '', ripeti: '' })
  const [resetErrore, setResetErrore] = useState<string | null>(null)
  const [eliminaTarget, setEliminaTarget] = useState<Utente | null>(null)
  const [eliminaErrore, setEliminaErrore] = useState<string | null>(null)

  // l'elenco degli utenti registrati è riservato agli amministratori
  async function carica() {
    if (!admin) {
      setUtenti([])
      setCaricamento(false)
      return
    }
    setCaricamento(true)
    const { data } = await dbLocale.utenti.list()
    if (data) setUtenti(data)
    setCaricamento(false)
  }

  useEffect(() => {
    void carica()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  useEffect(() => {
    if (utente) {
      setProfilo({ nome: utente.nome ?? '', cognome: utente.cognome ?? '', email: utente.email })
    }
  }, [utente])

  // ---- profilo personale ----
  async function salvaProfilo(e: FormEvent) {
    e.preventDefault()
    if (!utente) return
    setProfErrore(null)
    setProfOk(null)
    const { error } = await dbLocale.utenti.update(utente.id, {
      nome: profilo.nome.trim() || null,
      cognome: profilo.cognome.trim() || null,
      email: profilo.email.trim(),
    })
    if (error) {
      setProfErrore(error.code === '23505' ? 'Esiste già un utente con questa email.' : error.message)
      return
    }
    setProfOk('Dati aggiornati.')
    await ricarica()
    void carica()
  }

  async function inviaCambioPassword(e: FormEvent) {
    e.preventDefault()
    setPwdErrore(null)
    setPwdOk(null)
    if (pwd.nuova !== pwd.ripeti) {
      setPwdErrore('Le due nuove password non coincidono.')
      return
    }
    const esito = await cambiaPassword(pwd.vecchia, pwd.nuova)
    if (!esito.ok) {
      setPwdErrore(esito.messaggio ?? 'Cambio password non riuscito.')
      return
    }
    setPwd({ vecchia: '', nuova: '', ripeti: '' })
    setPwdOk('Password aggiornata.')
    setApriPwd(false)
  }

  // ---- nuovo utente ----
  async function creaUtente(e: FormEvent) {
    e.preventDefault()
    setNuovoErrore(null)
    setNuovoOk(null)
    if (nuovo.password !== nuovo.ripeti) {
      setNuovoErrore('Le due password non coincidono.')
      return
    }
    const { error } = await dbLocale.utenti.insert({
      nome: nuovo.nome.trim() || null,
      cognome: nuovo.cognome.trim() || null,
      email: nuovo.email.trim(),
      password: nuovo.password,
      ruolo: nuovo.ruolo,
    })
    if (error) {
      setNuovoErrore(error.code === '23505' ? 'Esiste già un utente con questa email.' : error.message)
      return
    }
    setNuovoOk(`Utente "${nuovo.email.trim()}" creato.`)
    setNuovo(NUOVO)
    void carica()
  }

  // ---- modifica altri utenti ----
  function avviaModifica(u: Utente) {
    setEditErrore(null)
    setEditId(u.id)
    setEditForm({ nome: u.nome ?? '', cognome: u.cognome ?? '', email: u.email, ruolo: u.ruolo })
  }

  async function salvaModifica() {
    if (!editId) return
    setEditErrore(null)
    const { error } = await dbLocale.utenti.update(editId, {
      nome: editForm.nome.trim() || null,
      cognome: editForm.cognome.trim() || null,
      email: editForm.email.trim(),
      ruolo: editForm.ruolo,
    })
    if (error) {
      setEditErrore(error.code === '23505' ? 'Esiste già un utente con questa email.' : error.message)
      return
    }
    setEditId(null)
    if (utente && utente.id === editId) await ricarica()
    void carica()
  }

  async function confermaReset() {
    if (!resetTarget) return
    setResetErrore(null)
    if (resetPwd.nuova !== resetPwd.ripeti) {
      setResetErrore('Le due password non coincidono.')
      return
    }
    const { error } = await dbLocale.utenti.resetPassword(resetTarget.id, resetPwd.nuova)
    if (error) {
      setResetErrore(error.message)
      return
    }
    setResetTarget(null)
    setResetPwd({ nuova: '', ripeti: '' })
  }

  async function confermaElimina() {
    if (!eliminaTarget) return
    setEliminaErrore(null)
    const { error } = await dbLocale.utenti.remove(eliminaTarget.id)
    if (error) {
      setEliminaErrore(error.message)
      return
    }
    setEliminaTarget(null)
    void carica()
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-bold text-cielo-800">Utenti</h1>
        <p className="mt-1 text-sm text-cielo-600">
          L'accesso al programma avviene con <b>email</b> (nome utente) e <b>password</b>. I dati restano su questo
          computer.
        </p>
      </section>

      {/* --- il mio profilo --- */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">Il mio profilo</h2>
        <form onSubmit={salvaProfilo} className="mt-3 max-w-2xl rounded-xl border border-cielo-200 bg-panna p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Nome">
              <input value={profilo.nome} onChange={(e) => setProfilo({ ...profilo, nome: e.target.value })} className={inputCls} />
            </Campo>
            <Campo label="Cognome">
              <input value={profilo.cognome} onChange={(e) => setProfilo({ ...profilo, cognome: e.target.value })} className={inputCls} />
            </Campo>
            <Campo label="Email (nome utente) *">
              <input type="email" value={profilo.email} onChange={(e) => setProfilo({ ...profilo, email: e.target.value })} className={inputCls} />
            </Campo>
          </div>

          {profErrore && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{profErrore}</p>}
          {profOk && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{profOk}</p>}
          {pwdOk && !apriPwd && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{pwdOk}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
            >
              Salva dati
            </button>
            <button
              type="button"
              onClick={() => {
                setApriPwd((v) => !v)
                setPwdErrore(null)
                setPwdOk(null)
              }}
              className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
            >
              {apriPwd ? 'Annulla cambio password' : 'Cambia password'}
            </button>
          </div>

          {apriPwd && (
            <div className="mt-4 rounded-xl border border-cielo-200 bg-cielo-50 p-4">
              <h3 className="text-sm font-semibold text-cielo-800">Cambia password</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Campo label="Password attuale">
                  <input type="password" value={pwd.vecchia} onChange={(e) => setPwd({ ...pwd, vecchia: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Nuova password (min. 8)">
                  <input type="password" value={pwd.nuova} onChange={(e) => setPwd({ ...pwd, nuova: e.target.value })} className={inputCls} />
                </Campo>
                <Campo label="Ripeti nuova password">
                  <input type="password" value={pwd.ripeti} onChange={(e) => setPwd({ ...pwd, ripeti: e.target.value })} className={inputCls} />
                </Campo>
              </div>
              {pwdErrore && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{pwdErrore}</p>}
              <button
                type="button"
                onClick={(e) => void inviaCambioPassword(e as unknown as FormEvent)}
                className="mt-4 rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
              >
                Aggiorna password
              </button>
            </div>
          )}
        </form>
      </section>

      {/* --- preferenze personali --- */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">Preferenze</h2>
        <div className="mt-3 max-w-2xl rounded-xl border border-cielo-200 bg-panna p-5">
          <h3 className="text-sm font-semibold text-cielo-800">Apertura delle mappe</h3>
          <p className="mt-1 text-sm text-cielo-600">
            Cosa succede quando clicchi l'icona del mappamondo accanto alla localizzazione di un immobile.
          </p>
          <div className="mt-4 space-y-2">
            <OpzioneMappa
              valore="finestra"
              attuale={modoMappa}
              onScegli={impostaModoMappa}
              titolo="Nella finestra dell'app"
              desc="Finestra ridimensionabile con la sola mappa navigabile."
            />
            <OpzioneMappa
              valore="browser"
              attuale={modoMappa}
              onScegli={impostaModoMappa}
              titolo="Nel browser"
              desc="Apre Google Maps completo nel browser predefinito."
            />
            <OpzioneMappa
              valore={null}
              attuale={modoMappa}
              onScegli={impostaModoMappa}
              titolo="Chiedimelo ogni volta"
              desc="Al prossimo clic l'app ti richiederà dove aprire la mappa."
            />
          </div>
          <p className="mt-4 rounded-lg bg-cielo-50 p-3 text-xs leading-relaxed text-cielo-600">
            Nota: aprire la mappa invia la localizzazione dell'immobile a Google. È l'unica funzione dell'app
            che usa internet; tutti gli altri dati restano su questo computer.
          </p>
        </div>
      </section>

      {/* --- nuovo utente (solo amministratori) --- */}
      {admin && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">Nuovo utente</h2>
          <form onSubmit={creaUtente} className="mt-3 max-w-2xl rounded-xl border border-cielo-200 bg-panna p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nome">
                <input value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} className={inputCls} />
              </Campo>
              <Campo label="Cognome">
                <input value={nuovo.cognome} onChange={(e) => setNuovo({ ...nuovo, cognome: e.target.value })} className={inputCls} />
              </Campo>
              <Campo label="Email (nome utente) *">
                <input type="email" value={nuovo.email} onChange={(e) => setNuovo({ ...nuovo, email: e.target.value })} className={inputCls} />
              </Campo>
              <Campo label="Ruolo">
                <select
                  value={nuovo.ruolo}
                  onChange={(e) => setNuovo({ ...nuovo, ruolo: e.target.value as 'utente' | 'admin' })}
                  className={inputCls}
                >
                  <option value="utente">Utente</option>
                  <option value="admin">Amministratore</option>
                </select>
              </Campo>
              <Campo label="Password * (min. 8 caratteri)">
                <input type="password" value={nuovo.password} onChange={(e) => setNuovo({ ...nuovo, password: e.target.value })} className={inputCls} />
              </Campo>
              <Campo label="Ripeti password *">
                <input type="password" value={nuovo.ripeti} onChange={(e) => setNuovo({ ...nuovo, ripeti: e.target.value })} className={inputCls} />
              </Campo>
            </div>

            {nuovoErrore && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{nuovoErrore}</p>}
            {nuovoOk && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{nuovoOk}</p>}

            <button
              type="submit"
              className="mt-5 rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
            >
              Crea utente
            </button>
          </form>
        </section>
      )}

      {/* --- elenco utenti: solo per gli amministratori --- */}
      {admin && (
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">
          Utenti registrati {caricamento ? '' : `(${utenti.length})`}
        </h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-cielo-200 bg-panna">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cielo-200 bg-cielo-50 text-left text-cielo-600">
                <th className="px-4 py-2 font-medium">Cognome</th>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Email (nome utente)</th>
                <th className="px-4 py-2 font-medium">Ruolo</th>
                <th className="w-28 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {caricamento ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-cielo-400">
                    Caricamento…
                  </td>
                </tr>
              ) : (
                utenti.map((u) =>
                  editId === u.id ? (
                    <tr key={u.id} className="border-b border-cielo-200 bg-cielo-50 last:border-0">
                      <td className="px-2 py-1.5">
                        <input value={editForm.cognome} onChange={(e) => setEditForm({ ...editForm, cognome: e.target.value })} className={inputSm} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} className={inputSm} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputSm} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={editForm.ruolo}
                          disabled={!admin || u.permanente}
                          title={u.permanente ? 'Amministratore permanente: ruolo non modificabile' : undefined}
                          onChange={(e) => setEditForm({ ...editForm, ruolo: e.target.value as 'utente' | 'admin' })}
                          className={inputSm}
                        >
                          <option value="utente">Utente</option>
                          <option value="admin">Amministratore</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => void salvaModifica()}
                            className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
                          >
                            Salva
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            title="Annulla"
                            className="rounded p-1.5 text-cielo-400 transition hover:bg-cielo-200 hover:text-cielo-700"
                          >
                            <IconaX />
                          </button>
                        </div>
                        {editErrore && <p className="pt-1 text-right text-xs text-red-700">{editErrore}</p>}
                      </td>
                    </tr>
                  ) : (
                    <tr key={u.id} className="group border-b border-cielo-100 transition last:border-0 hover:bg-cielo-50">
                      <td className="px-4 py-2 text-cielo-800">{u.cognome || '—'}</td>
                      <td className="px-4 py-2 text-cielo-800">{u.nome || '—'}</td>
                      <td className="px-4 py-2 text-cielo-600">
                        {u.email}
                        {utente?.id === u.id && <span className="ml-2 text-xs text-cielo-400">(tu)</span>}
                      </td>
                      <td className="px-4 py-2">
                        {u.ruolo === 'admin' ? (
                          <span className="flex flex-wrap items-center gap-1">
                            <span className="rounded-full bg-cielo-100 px-2 py-0.5 text-xs font-medium text-cielo-700">
                              amministratore
                            </span>
                            {u.permanente && (
                              <span
                                title="Amministratore permanente: non eliminabile né declassabile"
                                className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                              >
                                permanente
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-cielo-600">utente</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                          {(admin || utente?.id === u.id) && (
                            <button
                              onClick={() => avviaModifica(u)}
                              title="Modifica"
                              className="rounded p-1.5 text-cielo-400 transition hover:bg-amber-50 hover:text-amber-600"
                            >
                              <IconaMatita />
                            </button>
                          )}
                          {admin && (!u.permanente || utente?.id === u.id) && (
                            <button
                              onClick={() => {
                                setResetErrore(null)
                                setResetPwd({ nuova: '', ripeti: '' })
                                setResetTarget(u)
                              }}
                              title="Reimposta password"
                              className="rounded p-1.5 text-cielo-400 transition hover:bg-cielo-100 hover:text-cielo-700"
                            >
                              <IconaChiave />
                            </button>
                          )}
                          {admin && utente?.id !== u.id && !u.permanente && (
                            <button
                              onClick={() => {
                                setEliminaErrore(null)
                                setEliminaTarget(u)
                              }}
                              title="Elimina"
                              className="rounded p-1.5 text-cielo-400 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <IconaCestino />
                            </button>
                          )}
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
      )}

      {/* --- modale: reimposta password --- */}
      {resetTarget && (
        <Modale onChiudi={() => setResetTarget(null)}>
          <h3 className="text-lg font-semibold text-cielo-800">Reimposta password</h3>
          <p className="mt-2 text-sm text-cielo-700">
            Nuova password per <b>{resetTarget.email}</b>. Comunicagliela di persona: le password non sono
            recuperabili.
          </p>
          <div className="mt-4 space-y-3">
            <Campo label="Nuova password (min. 8)">
              <input type="password" value={resetPwd.nuova} onChange={(e) => setResetPwd({ ...resetPwd, nuova: e.target.value })} className={inputCls} />
            </Campo>
            <Campo label="Ripeti nuova password">
              <input type="password" value={resetPwd.ripeti} onChange={(e) => setResetPwd({ ...resetPwd, ripeti: e.target.value })} className={inputCls} />
            </Campo>
          </div>
          {resetErrore && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{resetErrore}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setResetTarget(null)} className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100">
              Annulla
            </button>
            <button
              onClick={() => void confermaReset()}
              className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
            >
              Imposta password
            </button>
          </div>
        </Modale>
      )}

      {/* --- modale: elimina utente --- */}
      {eliminaTarget && (
        <Modale onChiudi={() => setEliminaTarget(null)}>
          <h3 className="text-lg font-semibold text-cielo-800">Elimina utente</h3>
          <p className="mt-2 text-sm text-cielo-700">
            Stai per eliminare <b>{eliminaTarget.email}</b>. Non potrà più accedere al programma. I dati degli
            immobili restano invariati.
          </p>
          {eliminaErrore && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{eliminaErrore}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setEliminaTarget(null)} className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100">
              Annulla
            </button>
            <button
              onClick={() => void confermaElimina()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Elimina utente
            </button>
          </div>
        </Modale>
      )}
    </div>
  )
}

function OpzioneMappa({
  valore,
  attuale,
  onScegli,
  titolo,
  desc,
}: {
  valore: 'finestra' | 'browser' | null
  attuale: 'finestra' | 'browser' | null
  onScegli: (v: 'finestra' | 'browser' | null) => void
  titolo: string
  desc: string
}) {
  const scelta = attuale === valore
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
        scelta ? 'border-cielo-400 bg-cielo-50' : 'border-cielo-200 hover:bg-cielo-50'
      }`}
    >
      <input
        type="radio"
        name="modo-mappa"
        checked={scelta}
        onChange={() => onScegli(valore)}
        className="mt-0.5 accent-cielo-600"
      />
      <span>
        <span className="block text-sm font-medium text-cielo-800">{titolo}</span>
        <span className="mt-0.5 block text-xs text-cielo-600">{desc}</span>
      </span>
    </label>
  )
}

function Modale({ children, onChiudi }: { children: ReactNode; onChiudi: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-velo p-4" onClick={onChiudi}>
      <div
        className="w-full max-w-md rounded-2xl border border-cielo-200 bg-panna p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
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

function IconaMatita() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconaChiave() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.8-8.8" />
      <path d="m17 6 2.5 2.5" />
      <path d="m14.5 8.5 2.5 2.5" />
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
