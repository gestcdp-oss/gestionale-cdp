import { creaApiBrowser } from './dbBrowser'
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

export type ApiTravi = {
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

// Dentro TRAVI.exe il ponte `window.travi` esiste e comanda lui (archivio
// SQLite sul disco). Nel browser si usa il motore browser: stessa interfaccia,
// archivio nella memoria locale del browser di QUESTO computer.
export const dbLocale: ApiTravi = window.travi ?? creaApiBrowser()
