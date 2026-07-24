import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export type Profilo = {
  email: string
  nome: string | null
  ruolo: 'admin' | 'utente'
  attivo: boolean
}

type AuthState = {
  loading: boolean
  session: Session | null
  profilo: Profilo | null
  nonAutorizzato: boolean
  accediConGoogle: () => Promise<void>
  esci: () => Promise<void>
}

const AuthCtx = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profilo, setProfilo] = useState<Profilo | null>(null)
  const [nonAutorizzato, setNonAutorizzato] = useState(false)

  // Verifica whitelist: l'app considera "dentro" solo chi ha un profilo attivo.
  async function verificaProfilo(s: Session | null) {
    if (!s) {
      setProfilo(null)
      return
    }
    const { data, error } = await supabase.rpc('get_my_profile')
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) {
      // Email autenticata da Google ma non in whitelist -> fuori.
      setProfilo(null)
      setNonAutorizzato(true)
      await supabase.auth.signOut()
      return
    }
    setProfilo(row as Profilo)
    setNonAutorizzato(false)
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let attivo = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!attivo) return
      setSession(data.session)
      await verificaProfilo(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      await verificaProfilo(s)
    })
    return () => {
      attivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function accediConGoogle() {
    setNonAutorizzato(false)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  async function esci() {
    await supabase.auth.signOut()
    setSession(null)
    setProfilo(null)
    setNonAutorizzato(false)
  }

  return (
    <AuthCtx.Provider value={{ loading, session, profilo, nonAutorizzato, accediConGoogle, esci }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>')
  return ctx
}
