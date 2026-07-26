import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import { applicaTema, temaSalvato, temaValido } from '../lib/temi'
import { useAuth } from './useAuth'

const PER_PAGINA_AMMESSI = [10, 20, 30, 40, 50]

export type ModoMappa = 'finestra' | 'browser'

export const MENU_MIN = 170
export const MENU_MAX = 420

type PrefState = {
  tema: string
  perPagina: number
  /** larghezza della barra del menu, regolabile trascinandone il bordo */
  larghezzaMenu: number
  impostaLarghezzaMenu: (n: number) => void
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
  const [larghezzaMenu, setLarghezzaMenu] = useState(224)

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
      const l = Number(data.larghezza_menu)
      if (l >= MENU_MIN && l <= MENU_MAX) setLarghezzaMenu(l)
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

  function impostaLarghezzaMenu(n: number) {
    const larghezza = Math.min(MENU_MAX, Math.max(MENU_MIN, Math.round(n)))
    setLarghezzaMenu(larghezza)
    if (utente) void dbLocale.preferenze.imposta('larghezza_menu', String(larghezza))
  }

  function impostaModoMappa(m: ModoMappa | null) {
    setModoMappa(m)
    if (utente) void dbLocale.preferenze.imposta('mappa_modo', m)
  }

  return (
    <PrefCtx.Provider
      value={{
        tema,
        perPagina,
        modoMappa,
        larghezzaMenu,
        impostaTema,
        impostaPerPagina,
        impostaModoMappa,
        impostaLarghezzaMenu,
      }}
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
