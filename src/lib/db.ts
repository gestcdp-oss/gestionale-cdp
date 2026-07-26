import type { Immobile } from './tipi'

export type RispostaDb<T> = { data: T | null; error: { code?: string; message: string } | null }

export type ImmobileInput = {
  asset: string
  denominazione: string
  portafoglio: string | null
  localizzazione: string | null
}

type ApiTravi = {
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

const stub: ApiTravi = {
  immobili: {
    list: async () => ({ data: [], error: ERRORE_AMBIENTE }),
    insert: async () => ({ data: null, error: ERRORE_AMBIENTE }),
    update: async () => ({ data: null, error: ERRORE_AMBIENTE }),
    remove: async () => ({ data: null, error: ERRORE_AMBIENTE }),
  },
  versione: async () => 'n/d',
}

export const dbLocale: ApiTravi = window.travi ?? stub
