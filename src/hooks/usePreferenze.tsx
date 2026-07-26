import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import { applicaTema, temaSalvato, temaValido } from '../lib/temi'
import { useAuth } from './useAuth'

const PER_PAGINA_AMMESSI = [10, 20, 30, 40, 50]

export type ModoMappa = 'finestra' | 'browser'

type PrefState = {
  tema: string
  perPagina: number
  /** null = nessuna preferenza: al primo uso l'app chiede dove aprire la mappa */
  modoMappa: ModoMappa | null
  impostaTema: (id: string) => void
  impostaPerPagina: (n: number) => void
  impostaModoMappa: (m: ModoMappa | null) => void
}

const PrefCtx = createContext<PrefState | undefined>(undefined)

export function PreferenzeProvider({ children }: { children: ReactNode }) {
  const { utente } = useAuth()
  const [tema, setTema] = useState<string>(() => temaSalvato())
  const [perPagina, setPerPagina] = useState(10)
  const [modoMappa, setModoMappa] = useState<ModoMappa | null>(null)

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
      setModoMappa(data.mappa_modo === 'browser' || data.mappa_modo === 'finestra' ? data.mappa_modo : null)
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

  function impostaModoMappa(m: ModoMappa | null) {
    setModoMappa(m)
    if (utente) void dbLocale.preferenze.imposta('mappa_modo', m)
  }

  return (
    <PrefCtx.Provider
      value={{ tema, perPagina, modoMappa, impostaTema, impostaPerPagina, impostaModoMappa }}
    >
      {children}
    </PrefCtx.Provider>
  )
}

export function usePreferenze(): PrefState {
  const c = useContext(PrefCtx)
  if (!c) throw new Error('usePreferenze va usato dentro <PreferenzeProvider>')
  return c
}
