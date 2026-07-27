import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePreferenze, MENU_MIN, MENU_MAX } from '../hooks/usePreferenze'
import Icona from './Icone'
import type { NomeIcona } from './Icone'
import { useSelezione } from '../hooks/useSelezione'
import { useAggiornamenti } from './GestoreAggiornamenti'
import AggiornaWebBanner from './AggiornaWebBanner'
import { TEMI } from '../lib/temi'
import { GRUPPI_IMMOBILE } from '../lib/menu'

const LOGO = './logo.svg'

export default function Layout() {
  const { utente, esci } = useAuth()
  const { immobile, seleziona } = useSelezione()
  const { tema, impostaTema, larghezzaMenu, impostaLarghezzaMenu } = usePreferenze()
  const { controlloManuale, controllaOra } = useAggiornamenti()

  // larghezza del menu: si trascina il bordo destro
  const [larghezza, setLarghezza] = useState(larghezzaMenu)
  const trascinamento = useRef(false)

  useEffect(() => setLarghezza(larghezzaMenu), [larghezzaMenu])

  const muovi = useCallback((e: MouseEvent) => {
    if (!trascinamento.current) return
    setLarghezza(Math.min(MENU_MAX, Math.max(MENU_MIN, e.clientX)))
  }, [])

  const rilascia = useCallback(() => {
    if (!trascinamento.current) return
    trascinamento.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    setLarghezza((l) => {
      impostaLarghezzaMenu(l) // la misura scelta viene ricordata
      return l
    })
  }, [impostaLarghezzaMenu])

  useEffect(() => {
    window.addEventListener('mousemove', muovi)
    window.addEventListener('mouseup', rilascia)
    return () => {
      window.removeEventListener('mousemove', muovi)
      window.removeEventListener('mouseup', rilascia)
    }
  }, [muovi, rilascia])

  function iniziaTrascinamento() {
    trascinamento.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    // Layout a schermo fisso: header e menù restano sempre visibili,
    // scorre soltanto l'area dei contenuti.
    <div className="flex h-screen flex-col overflow-hidden bg-cielo-100">
      {/* HEADER */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-cielo-200 bg-panna px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="flex shrink-0 items-center gap-2" title="Vai alla home">
            <img src={LOGO} alt="TR.A.V.I." className="h-10 w-10" />
            <span className="leading-tight">
              <span className="block text-lg font-bold tracking-tight text-cielo-800">TR.A.V.I.</span>
              <span className="block text-[10px] uppercase tracking-wide text-cielo-500">
                Tracciamento Attività e Verifica Immobili
              </span>
            </span>
          </Link>

          <NavLink
            to="/utenti"
            title="Gestione utenti"
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                isActive ? 'bg-cielo-200 text-cielo-800' : 'text-cielo-700 hover:bg-cielo-50'
              }`
            }
          >
            <IconaUtenti />
            Utenti
          </NavLink>

          {immobile && (
            <span className="flex min-w-0 items-center gap-2 rounded-full bg-cielo-100 py-1 pl-3 pr-1.5 text-sm text-cielo-800">
              <span className="shrink-0 text-cielo-600">Immobile selezionato:</span>
              <b className="truncate font-semibold">{immobile.denominazione}</b>
              <button
                onClick={() => seleziona(null)}
                title="Deseleziona"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-cielo-500 transition hover:bg-cielo-200 hover:text-cielo-700"
              >
                ×
              </button>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 text-sm">
          {/* quadratini per la scelta del tema */}
          <div className="flex items-center gap-1.5">
            {TEMI.map((t) => (
              <button
                key={t.id}
                onClick={() => impostaTema(t.id)}
                title={t.nome}
                aria-label={`Tema ${t.nome}`}
                className={`h-5 w-5 overflow-hidden rounded transition ${
                  tema === t.id
                    ? 'ring-2 ring-cielo-600 ring-offset-1 ring-offset-panna'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{ background: `linear-gradient(135deg, ${t.c1} 0 50%, ${t.c2} 50% 100%)` }}
              />
            ))}
          </div>

          {/* il numero di versione è cliccabile: verifica subito se c'è un aggiornamento */}
          <button
            onClick={() => void controllaOra()}
            disabled={controlloManuale === 'incorso'}
            title="Clicca per controllare se è disponibile un aggiornamento"
            className="rounded px-1.5 py-1 text-xs text-cielo-400 transition hover:bg-cielo-50 hover:text-cielo-600"
          >
            {controlloManuale === 'incorso'
              ? 'controllo…'
              : controlloManuale === 'aggiornato'
                ? 'già aggiornato ✓'
                : `v${__APP_VERSION__}`}
          </button>

          <span className="hidden text-cielo-700 md:inline">
            {[utente?.nome, utente?.cognome].filter(Boolean).join(' ') || utente?.email}
            {utente?.ruolo === 'admin' && <span className="ml-1 text-xs text-cielo-500">· admin</span>}
          </span>
          <button
            onClick={() => void esci()}
            className="rounded-lg border border-cielo-300 px-3 py-1.5 text-cielo-700 transition hover:bg-cielo-50"
          >
            Esci
          </button>
        </div>
      </header>

      {/* CORPO: menù + contenuto */}
      <div className="flex flex-1 overflow-hidden">
        <aside
          style={{ width: larghezza }}
          className="shrink-0 overflow-y-auto border-r border-cielo-200 bg-sidebar p-3"
        >
          <Gruppo titolo="Anagrafiche" />
          <VoceMenu to="/immobili" label="Inserisci/Seleziona Immobile" icona="immobili" />

          {immobile ? (
            <>
              {GRUPPI_IMMOBILE.map((gruppo, i) => (
                <div key={gruppo.titolo}>
                  <Gruppo titolo={gruppo.titolo} />
                  {i === 0 && (
                    <p
                      className="truncate px-3 pb-2 text-xs font-semibold text-cielo-700"
                      title={immobile.denominazione}
                    >
                      {immobile.asset} · {immobile.denominazione}
                    </p>
                  )}
                  {gruppo.voci.map((v) => (
                    <VoceMenu key={v.id} to={v.percorso} label={v.etichetta} icona={v.icona} />
                  ))}
                </div>
              ))}
            </>
          ) : (
            <p className="mt-6 rounded-lg bg-cielo-50 px-3 py-3 text-xs leading-relaxed text-cielo-600">
              Seleziona un immobile dall'elenco (icona della mano) per vedere le sue attività.
            </p>
          )}
        </aside>

        {/* bordo trascinabile per allargare o stringere il menu */}
        <div
          onMouseDown={iniziaTrascinamento}
          onDoubleClick={() => impostaLarghezzaMenu(224)}
          title="Trascina per cambiare la larghezza del menu (doppio clic per la misura standard)"
          className="group w-1.5 shrink-0 cursor-col-resize bg-cielo-200 transition hover:bg-cielo-400"
        >
          <div className="mx-auto mt-[45vh] h-8 w-0.5 rounded bg-cielo-400 transition group-hover:bg-cielo-600" />
        </div>

        {/* id="contenuto": è questo il riquadro che scorre (vedi scorriInCima) */}
        <main id="contenuto" className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* avviso di nuova versione (solo modalità browser) */}
      <AggiornaWebBanner />
    </div>
  )
}

function Gruppo({ titolo }: { titolo: string }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-cielo-500 first:pt-1">
      {titolo}
    </p>
  )
}

function VoceMenu({ to, label, icona }: { to?: string; label: string; icona: NomeIcona }) {
  if (!to) {
    return (
      <div
        title={`${label} — in preparazione`}
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-cielo-400"
      >
        <Icona nome={icona} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 rounded-full bg-cielo-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide">
          presto
        </span>
      </div>
    )
  }
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-cielo-200 text-cielo-800' : 'text-cielo-700 hover:bg-cielo-50'
        }`
      }
    >
      <Icona nome={icona} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </NavLink>
  )
}

function IconaUtenti() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
