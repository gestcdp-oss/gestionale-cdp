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
  mappa: {
    apri(query: string, modo: 'finestra' | 'browser'): Promise<RispostaDb<null>>
    anteprima(query: string, tipo: 'mappa' | 'streetview'): Promise<RispostaDb<string>>
  }
  database: {
    esporta(): Promise<RispostaDb<{ percorso: string; immobili: number } | null>>
    verificaImport(): Promise<RispostaDb<AnteprimaImport | null>>
    applicaImport(percorso: string): Promise<RispostaDb<{ copiaSicurezza: string; immobili: number }>>
  }
  sistemazione: {
    stato(): Promise<RispostaDb<{ serve: boolean; posizioneAttuale: string; destinazione: string }>>
    esegui(scelte: {
      collegamentoDesktop: boolean
      collegamentoMenu: boolean
    }): Promise<RispostaDb<{ destinazione: string }>>
    rifiuta(): Promise<RispostaDb<null>>
  }
  collegamenti: {
    stato(): Promise<RispostaDb<StatoCollegamenti>>
    crea(scelte: { desktop: boolean; menuAvvio: boolean }): Promise<RispostaDb<{ fatti: string[] }>>
    rimanda(): Promise<RispostaDb<null>>
    mostraCartella(): Promise<RispostaDb<null>>
  }
  aggiornamenti: {
    stato(): Promise<RispostaDb<StatoAggiornamento>>
    controlla(): Promise<RispostaDb<unknown>>
    installa(): Promise<RispostaDb<null>>
    osserva(callback: (stato: StatoAggiornamento) => void): () => void
  }
  versione(): Promise<string>
}

export type AnteprimaImport = {
  percorso: string
  versione: string
  immobili: number
  esportatoDa: string
  esportatoIl: string
  immobiliAttuali: number
}

export type StatoCollegamenti = { desktop: boolean; menuAvvio: boolean; giaChiesto: boolean }

export type FaseAggiornamento =
  | 'inattivo'
  | 'controllo'
  | 'disponibile'
  | 'download'
  | 'installazione'
  | 'errore'

export type StatoAggiornamento = {
  supportato: boolean
  versioneCorrente: string
  fase: FaseAggiornamento
  percentuale: number
  disponibile: { versione: string; note: string } | null
  messaggio: string
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
  mappa: { apri: ko, anteprima: ko },
  database: { esporta: ko, verificaImport: ko, applicaImport: ko },
  sistemazione: {
    stato: async () => ({
      data: { serve: false, posizioneAttuale: '', destinazione: '' },
      error: ERRORE_AMBIENTE,
    }),
    esegui: ko,
    rifiuta: ko,
  },
  collegamenti: {
    stato: async () => ({ data: { desktop: false, menuAvvio: false, giaChiesto: true }, error: ERRORE_AMBIENTE }),
    crea: ko,
    rimanda: ko,
    mostraCartella: ko,
  },
  aggiornamenti: {
    stato: async () => ({
      data: {
        supportato: false,
        versioneCorrente: '',
        fase: 'inattivo' as const,
        percentuale: 0,
        disponibile: null,
        messaggio: '',
      },
      error: null,
    }),
    controlla: ko,
    installa: ko,
    osserva: () => () => {},
  },
  versione: async () => 'n/d',
}

export const dbLocale: ApiTravi = window.travi ?? stub
