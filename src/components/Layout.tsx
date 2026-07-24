import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSelezione } from '../hooks/useSelezione'

const LOGO = `${import.meta.env.BASE_URL}logo.svg`

export default function Layout() {
  const { profilo, esci } = useAuth()
  const { immobile, seleziona } = useSelezione()

  return (
    <div className="flex min-h-full flex-col bg-cielo-100">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4 border-b border-cielo-200 bg-panna px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="flex shrink-0 items-center gap-2" title="Vai alla home">
            <img src={LOGO} alt="TR.A.V.I." className="h-9 w-9" />
            <span className="text-lg font-bold tracking-tight text-cielo-800">TR.A.V.I.</span>
          </Link>
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
          <span className="hidden text-cielo-700 sm:inline">
            {profilo?.nome || profilo?.email}
            {profilo?.ruolo === 'admin' && <span className="ml-1 text-emerald-600">· admin</span>}
          </span>
          <button
            onClick={() => void esci()}
            className="rounded-lg border border-cielo-300 bg-white/60 px-3 py-1.5 text-cielo-700 transition hover:bg-white"
          >
            Esci
          </button>
        </div>
      </header>

      {/* CORPO: sidebar + contenuto */}
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-cielo-200 bg-panna/70 p-3">
          <Gruppo titolo="Anagrafiche" />
          <VoceMenu to="/immobili" label="Immobili" />
          <Gruppo titolo="Attività" />
          <VoceMenu label="Building Manager" />
          <VoceMenu label="Lavori" />
          <VoceMenu label="Verde / Ambiente" />
          <VoceMenu label="Vigilanze / DUVRI" />
          <Gruppo titolo="Output" />
          <VoceMenu label="Report e certificati" />
        </aside>

        <main className="min-w-0 flex-1 p-6">
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
          isActive ? 'bg-cielo-200 text-cielo-800' : 'text-cielo-700 hover:bg-cielo-100'
        }`
      }
    >
      {label}
    </NavLink>
  )
}
