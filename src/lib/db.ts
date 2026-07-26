import type { Immobile } from './tipi'

export type RispostaDb<T> = { data: T | null; error: { code?: string; message: string } | null }

export type ImmobileInput = {
  asset: string
  denominazione: string
  portafoglio: string | null
  localizzazione: string | null
}

export type Utente = {
  id: string
  nome: string | null
  cognome: string | null
  email: string
  ruolo: 'admin' | 'utente'
  attivo: boolean
  creato_il?: string
  /** true per l'amministratore permanente (non eliminabile né declassabile) */
  permanente?: boolean
}

export type NuovoUtente = {
  nome: string | null
  cognome: string | null
  email: string
  password: string
  ruolo?: 'admin' | 'utente'
}

export type StatoAuth = { serveSetup: boolean; utente: Utente | null }

type ApiTravi = {
  auth: {
    stato(): Promise<RispostaDb<StatoAuth>>
    setup(r: NuovoUtente): Promise<RispostaDb<Utente>>
    login(email: string, password: string): Promise<RispostaDb<Utente>>
    logout(): Promise<RispostaDb<null>>
    cambiaPassword(vecchia: string, nuova: string): Promise<RispostaDb<null>>
  }
  utenti: {
    list(): Promise<RispostaDb<Utente[]>>
    insert(r: NuovoUtente): Promise<RispostaDb<null>>
    update(id: string, campi: Partial<Utente>): Promise<RispostaDb<null>>
    resetPassword(id: string, nuova: string): Promise<RispostaDb<null>>
    remove(id: string): Promise<RispostaDb<null>>
  }
  preferenze: {
    tutte(): Promise<RispostaDb<Record<string, string>>>
    imposta(chiave: string, valore: string | null): Promise<RispostaDb<null>>
  }
  immobili: {
    list(): Promise<RispostaDb<Immobile[]>>
    insert(r: ImmobileInput): Promise<RispostaDb<null>>
    update(id: string, campi: ImmobileInput): Promise<RispostaDb<null>>
    remove(id: string): Promise<RispostaDb<null>>
  }
  versione(): Promise<string>
}

declare global {
  interface Window {
    travi?: ApiTravi
  }
}

// Se la pagina viene aperta fuori dall'app desktop (es. browser), niente crash:
// tutte le chiamate rispondono con un errore chiaro.
const ERRORE_AMBIENTE = { message: 'Questa applicazione va avviata da TRAVI.exe (ambiente desktop).' }
const ko = async () => ({ data: null, error: ERRORE_AMBIENTE })

const stub: ApiTravi = {
  auth: {
    stato: async () => ({ data: { serveSetup: false, utente: null }, error: ERRORE_AMBIENTE }),
    setup: ko,
    login: ko,
    logout: ko,
    cambiaPassword: ko,
  },
  utenti: { list: async () => ({ data: [], error: ERRORE_AMBIENTE }), insert: ko, update: ko, resetPassword: ko, remove: ko },
  preferenze: { tutte: async () => ({ data: {}, error: ERRORE_AMBIENTE }), imposta: ko },
  immobili: { list: async () => ({ data: [], error: ERRORE_AMBIENTE }), insert: ko, update: ko, remove: ko },
  versione: async () => 'n/d',
}

export const dbLocale: ApiTravi = window.travi ?? stub
