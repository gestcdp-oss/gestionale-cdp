import { useAuth } from '../hooks/useAuth'

export default function HomePage() {
  const { profilo, esci } = useAuth()

  return (
    <div className="min-h-full bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <h1 className="font-semibold text-slate-800">Gestionale CDP</h1>
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

      <main className="mx-auto max-w-4xl p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-800">Accesso effettuato ✓</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            L'impalcatura è pronta e i dati sono protetti dalla RLS. Da qui costruiremo i moduli del
            gestionale (fornitori e tutto il resto).
          </p>
        </div>
      </main>
    </div>
  )
}
