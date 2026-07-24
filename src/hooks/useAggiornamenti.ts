import { useEffect, useState } from 'react'

// Versione "cotta" nel bundle al momento della build (short SHA del commit).
const VERSIONE_CORRENTE = __APP_VERSION__

/**
 * Ritorna true quando sul server risulta pubblicata una versione diversa da
 * quella in esecuzione: cioe quando un deploy REALE e avvenuto.
 * In sviluppo (version.json assente) o offline non mostra mai nulla.
 */
export function useAggiornamenti(): boolean {
  const [nuovaVersione, setNuovaVersione] = useState(false)

  useEffect(() => {
    let annullato = false

    async function controlla() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const dati = (await res.json()) as { version?: string }
        if (!annullato && dati.version && dati.version !== VERSIONE_CORRENTE) {
          setNuovaVersione(true)
        }
      } catch {
        /* offline o file assente: nessun aggiornamento da segnalare */
      }
    }

    controlla()
    const id = window.setInterval(controlla, 60_000)
    const alRitorno = () => {
      if (document.visibilityState === 'visible') controlla()
    }
    window.addEventListener('focus', alRitorno)
    document.addEventListener('visibilitychange', alRitorno)

    return () => {
      annullato = true
      window.clearInterval(id)
      window.removeEventListener('focus', alRitorno)
      document.removeEventListener('visibilitychange', alRitorno)
    }
  }, [])

  return nuovaVersione
}
