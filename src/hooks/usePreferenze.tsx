import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import { applicaTema, temaSalvato, temaValido } from '../lib/temi'
import { useAuth } from './useAuth'

const PER_PAGINA_AMMESSI = [10, 20, 30, 40, 50]

type PrefState = {
  tema: string
  perPagina: number
  impostaTema: (id: string) => void
  impostaPerPagina: (n: number) => void
}

const PrefCtx = createContext<PrefState | undefined>(undefined)

export function PreferenzeProvider({ children }: { children: ReactNode }) {
  const { utente } = useAuth()
  const [tema, setTema] = useState<string>(() => temaSalvato())
  const [perPagina, setPerPagina] = useState(10)

  // applica subito il tema ricordato su questo computer
  useEffect(() => {
    applicaTema(tema)
  }, [tema])

  // al login carica le preferenze salvate dell'utente
  useEffect(() => {
    if (!utente) return
    let vivo = true
    void dbLocale.preferenze.tutte().then(({ data }) => {
      if (!vivo || !data) return
      setTema(temaValido(data.tema))
      const n = Number(data.per_pagina)
      if (PER_PAGINA_AMMESSI.includes(n)) setPerPagina(n)
    })
    return () => {
      vivo = false
    }
  }, [utente])

  function impostaTema(id: string) {
    const t = temaValido(id)
    setTema(t)
    if (utente) void dbLocale.preferenze.imposta('tema', t)
  }

  function impostaPerPagina(n: number) {
    if (!PER_PAGINA_AMMESSI.includes(n)) return
    setPerPagina(n)
    if (utente) void dbLocale.preferenze.imposta('per_pagina', String(n))
  }

  return (
    <PrefCtx.Provider value={{ tema, perPagina, impostaTema, impostaPerPagina }}>{children}</PrefCtx.Provider>
  )
}

export function usePreferenze(): PrefState {
  const c = useContext(PrefCtx)
  if (!c) throw new Error('usePreferenze va usato dentro <PreferenzeProvider>')
  return c
}
