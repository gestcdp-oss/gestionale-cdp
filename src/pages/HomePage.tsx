import { useAuth } from '../hooks/useAuth'

const LOGO = `${import.meta.env.BASE_URL}logo.svg`

export default function HomePage() {
  const { profilo, esci } = useAuth()

  return (
    <div className="min-h-full bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <img src={LOGO} alt="" className="h-8 w-8" />
          <h1 className="font-semibold tracking-tight text-slate-800">T.E.G.O.L.A.</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">
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
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
          <img src={LOGO} alt="T.E.G.O.L.A." className="h-28 w-28" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-800">T.E.G.O.L.A.</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Tracking Elementi, Gestione Operativa, Locazioni e Asset
          </p>
          <div className="mt-6 w-full border-t border-slate-100 pt-6">
            <p className="mx-auto max-w-md text-sm text-slate-500">
              Impalcatura pronta e dati protetti. Da qui costruiamo i moduli del gestionale.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
