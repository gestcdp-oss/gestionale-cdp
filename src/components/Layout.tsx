import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const LOGO = `${import.meta.env.BASE_URL}logo.svg`

export default function Layout() {
  const { profilo, esci } = useAuth()

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src={LOGO} alt="" className="h-8 w-8" />
              <span className="font-semibold tracking-tight text-slate-800">TR.A.V.I.</span>
            </div>
            <nav className="flex items-center gap-1 text-sm">
              <Voce to="/" label="Home" />
              <Voce to="/immobili" label="Immobili" />
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">
              {profilo?.nome || profilo?.email}
              {profilo?.ruolo === 'admin' && <span className="ml-1 text-emerald-600">· admin</span>}
            </span>
            <button
              onClick={() => void esci()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 transition hover:bg-slate-50"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

function Voce({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 transition ${
          isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-500 hover:text-slate-800'
        }`
      }
    >
      {label}
    </NavLink>
  )
}
