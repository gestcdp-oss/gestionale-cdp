import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type ImmobileSel = { id: string; asset: string; denominazione: string } | null

type Ctx = {
  immobile: ImmobileSel
  seleziona: (im: ImmobileSel) => void
}

const SelCtx = createContext<Ctx | undefined>(undefined)
const CHIAVE = 'travi_immobile_sel'

export function SelezioneProvider({ children }: { children: ReactNode }) {
  const [immobile, setImmobile] = useState<ImmobileSel>(() => {
    try {
      const raw = localStorage.getItem(CHIAVE)
      return raw ? (JSON.parse(raw) as ImmobileSel) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      if (immobile) localStorage.setItem(CHIAVE, JSON.stringify(immobile))
      else localStorage.removeItem(CHIAVE)
    } catch {
      /* ignora */
    }
  }, [immobile])

  return <SelCtx.Provider value={{ immobile, seleziona: setImmobile }}>{children}</SelCtx.Provider>
}

export function useSelezione(): Ctx {
  const c = useContext(SelCtx)
  if (!c) throw new Error('useSelezione va usato dentro <SelezioneProvider>')
  return c
}
