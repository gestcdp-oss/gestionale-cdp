import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'

export default function LoginPage() {
  const { session, profilo, nonAutorizzato, accediConGoogle, loading } = useAuth()
  const nav = useNavigate()

  useEffect(() => {
    if (session && profilo) nav('/', { replace: true })
  }, [session, profilo, nav])

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
        <img
          src={`${import.meta.env.BASE_URL}logo.svg`}
          alt="T.E.G.O.L.A."
          className="mx-auto h-20 w-20"
        />
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-800">T.E.G.O.L.A.</h1>
        <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
          Tracking Elementi, Gestione Operativa, Locazioni e Asset
        </p>
        <p className="mt-3 text-sm text-slate-500">Accesso riservato</p>

        {nonAutorizzato && (
          <div className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Questo indirizzo non è autorizzato ad accedere.
          </div>
        )}

        {!isSupabaseConfigured && (
          <div className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            Configurazione mancante: modalità sviluppo.
          </div>
        )}

        <button
          onClick={() => void accediConGoogle()}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <GoogleG />
          Accedi con Google
        </button>
      </div>
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
