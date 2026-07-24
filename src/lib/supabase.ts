import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

/** true se le variabili d'ambiente sono presenti (altrimenti l'app resta in "modalita sviluppo"). */
export const isSupabaseConfigured = Boolean(url && anon)

// Storage robusto: scrive su localStorage E sessionStorage in modo da non perdere
// il code_verifier PKCE durante il redirect OAuth (soprattutto su mobile / Safari).
const robustStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* ignora */
    }
    try {
      sessionStorage.setItem(key, value)
    } catch {
      /* ignora */
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignora */
    }
    try {
      sessionStorage.removeItem(key)
    } catch {
      /* ignora */
    }
  },
}

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anon ?? 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: robustStorage,
  },
})
