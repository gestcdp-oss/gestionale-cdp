import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import type { ImmobileInput } from '../lib/db'
import type { Immobile } from '../lib/tipi'

/**
 * Unica fonte dei dati degli immobili: tutte le schermate leggono da qui, così
 * una modifica fatta in un punto si vede immediatamente in tutti gli altri
 * (elenco, scheda, intestazione) senza ricaricare nulla.
 */
type Esito = { ok: boolean; messaggio?: string; codice?: string }

type Ctx = {
  immobili: Immobile[]
  caricamento: boolean
  ricarica: () => Promise<void>
  inserisci: (r: ImmobileInput) => Promise<Esito>
  aggiorna: (id: string, r: ImmobileInput) => Promise<Esito>
  elimina: (id: string) => Promise<Esito>
}

const ImmCtx = createContext<Ctx | undefined>(undefined)

export function ImmobiliProvider({ children }: { children: ReactNode }) {
  const [immobili, setImmobili] = useState<Immobile[]>([])
  const [caricamento, setCaricamento] = useState(true)

  const ricarica = useCallback(async () => {
    const { data } = await dbLocale.immobili.list()
    if (data) setImmobili(data)
    setCaricamento(false)
  }, [])

  useEffect(() => {
    void ricarica()
    // versione browser: quando l'archivio viene riallineato dal file (perché un
    // altro browser ha scritto dati più recenti), l'elenco si aggiorna da solo
    const aggiorna = () => void ricarica()
    window.addEventListener('travi-archivio-importato', aggiorna)
    return () => window.removeEventListener('travi-archivio-importato', aggiorna)
  }, [ricarica])

  async function inserisci(r: ImmobileInput): Promise<Esito> {
    const { error } = await dbLocale.immobili.insert(r)
    if (error) return { ok: false, messaggio: error.message, codice: error.code }
    await ricarica()
    return { ok: true }
  }

  async function aggiorna(id: string, r: ImmobileInput): Promise<Esito> {
    const { error } = await dbLocale.immobili.update(id, r)
    if (error) return { ok: false, messaggio: error.message, codice: error.code }
    // aggiornamento immediato in memoria: la modifica si vede subito ovunque
    setImmobili((elenco) => elenco.map((i) => (i.id === id ? { ...i, ...r } : i)))
    void ricarica()
    return { ok: true }
  }

  async function elimina(id: string): Promise<Esito> {
    const { error } = await dbLocale.immobili.remove(id)
    if (error) return { ok: false, messaggio: error.message, codice: error.code }
    setImmobili((elenco) => elenco.filter((i) => i.id !== id))
    void ricarica()
    return { ok: true }
  }

  return (
    <ImmCtx.Provider value={{ immobili, caricamento, ricarica, inserisci, aggiorna, elimina }}>
      {children}
    </ImmCtx.Provider>
  )
}

export function useImmobili(): Ctx {
  const c = useContext(ImmCtx)
  if (!c) throw new Error('useImmobili va usato dentro <ImmobiliProvider>')
  return c
}
