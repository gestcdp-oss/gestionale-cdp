import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePreferenze } from '../hooks/usePreferenze'
import { useSelezione } from '../hooks/useSelezione'
import { TEMI } from '../lib/temi'

const LOGO = './logo.svg'

// Piani di attività: compaiono SOLO quando è selezionato un immobile.
const ATTIVITA = [
  'Building Manager',
  'Due Diligence',
  'Lavori',
  'Prof SIA',
  'Verde',
  'Prof SIA Ambiente',
  'Lavori Ambiente',
  'Resp. Amianto',
  'Vigilanze',
  'DUVRI',
]

export default function Layout() {
  const { utente, esci } = useAuth()
  const { immobile, seleziona } = useSelezione()
  const { tema, impostaTema } = usePreferenze()

  return (
    // Layout a schermo fisso: header e menù restano sempre visibili,
    // scorre soltanto l'area dei contenuti.
    <div className="flex h-screen flex-col overflow-hidden bg-cielo-100">
      {/* HEADER */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-cielo-200 bg-panna px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="flex shrink-0 items-center gap-2" title="Vai alla home">
            <img src={LOGO} alt="TR.A.V.I." className="h-9 w-9" />
            <span className="text-lg font-bold tracking-tight text-cielo-800">TR.A.V.I.</span>
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

          <span className="text-xs text-cielo-400">v{__APP_VERSION__}</span>

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
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-cielo-200 bg-sidebar p-3">
          <Gruppo titolo="Anagrafiche" />
          <VoceMenu to="/immobili" label="Immobili" />

          {immobile ? (
            <>
              <Gruppo titolo="Attività dell'immobile" />
              <p className="truncate px-3 pb-2 text-xs font-semibold text-cielo-700" title={immobile.denominazione}>
                {immobile.asset} · {immobile.denominazione}
              </p>
              {ATTIVITA.map((a) => (
                <VoceMenu key={a} label={a} />
              ))}
              <Gruppo titolo="Output" />
              <VoceMenu label="Report e certificati" />
            </>
          ) : (
            <p className="mt-6 rounded-lg bg-cielo-50 px-3 py-3 text-xs leading-relaxed text-cielo-600">
              Seleziona un immobile dall'elenco (icona della mano) per vedere le sue attività.
            </p>
          )}
        </aside>

        {/* id="contenuto": è questo il riquadro che scorre (vedi scorriInCima) */}
        <main id="contenuto" className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
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

function VoceMenu({ to, label }: { to?: string; label: string }) {
  if (!to) {
    return (
      <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-cielo-400">
        <span>{label}</span>
        <span className="rounded-full bg-cielo-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide">
          presto
        </span>
      </div>
    )
  }
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-cielo-200 text-cielo-800' : 'text-cielo-700 hover:bg-cielo-50'
        }`
      }
    >
      {label}
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
