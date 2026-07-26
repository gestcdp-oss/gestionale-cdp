import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dbLocale } from '../lib/db'
import type { StatoAggiornamento } from '../lib/db'

const LOGO = './logo.svg'
// Oltre questo tempo si entra comunque nel programma: se GitHub non risponde,
// il lavoro non deve mai restare bloccato.
const ATTESA_MASSIMA_CONTROLLO = 10000

const STATO_INIZIALE: StatoAggiornamento = {
  supportato: false,
  versioneCorrente: '',
  fase: 'inattivo',
  percentuale: 0,
  disponibile: null,
  messaggio: '',
}

/**
 * All'avvio controlla e, se serve, installa l'aggiornamento PRIMA di ogni altra
 * cosa. Dopo l'avvio, se ne esce uno nuovo, mostra il banner arancione.
 */
export default function GestoreAggiornamenti({ children }: { children: ReactNode }) {
  const [stato, setStato] = useState<StatoAggiornamento>(STATO_INIZIALE)
  const [avvioConcluso, setAvvioConcluso] = useState(false)
  const [rimandato, setRimandato] = useState(false)
  const [erroreAvvio, setErroreAvvio] = useState<string | null>(null)

  // resta in ascolto dei cambi di stato (controllo, avanzamento, errori)
  useEffect(() => dbLocale.aggiornamenti.osserva(setStato), [])

  // sequenza di avvio: controlla → se c'è, installa subito
  useEffect(() => {
    let vivo = true
    async function avvio() {
      const { data } = await dbLocale.aggiornamenti.stato()
      if (data) setStato(data)
      if (!data?.supportato) {
        if (vivo) setAvvioConcluso(true)
        return
      }
      // il controllo non può far aspettare all'infinito
      const controllo = dbLocale.aggiornamenti.controlla()
      const scaduto = new Promise((r) => setTimeout(() => r('scaduto'), ATTESA_MASSIMA_CONTROLLO))
      const esito = await Promise.race([controllo, scaduto])
      if (!vivo) return
      const trovato =
        esito !== 'scaduto' && (esito as { data?: unknown })?.data
          ? ((esito as { data: unknown }).data as { versione?: string } | null)
          : null
      if (!trovato) {
        setAvvioConcluso(true)
        return
      }
      // aggiornamento trovato: si installa subito (l'app si riavvia da sola)
      const inst = await dbLocale.aggiornamenti.installa()
      if (!vivo) return
      if (inst.error) {
        setErroreAvvio(inst.error.message)
        setAvvioConcluso(true)
      }
      // se è andato a buon fine l'app si chiude da sola
    }
    void avvio()
    return () => {
      vivo = false
    }
  }, [])

  const inCorso = stato.fase === 'download' || stato.fase === 'installazione'

  // --- schermata di avvio: nulla è accessibile finché non si conclude ---
  if (!avvioConcluso) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-cielo-100 p-6 text-center">
        <img src={LOGO} alt="TR.A.V.I." className="h-28 w-28" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-cielo-800">TR.A.V.I.</h1>
        {inCorso ? (
          <>
            <p className="mt-4 text-cielo-700">
              {stato.fase === 'download'
                ? `Scaricamento aggiornamento ${stato.disponibile?.versione ?? ''}…`
                : 'Installazione in corso: il programma si riavvia da solo…'}
            </p>
            <div className="mt-4 h-2.5 w-72 overflow-hidden rounded-full bg-cielo-200">
              <div
                className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
                style={{ width: `${Math.max(4, stato.percentuale)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-cielo-500">{stato.percentuale}%</p>
          </>
        ) : (
          <p className="mt-4 text-cielo-600">Controllo aggiornamenti…</p>
        )}
      </div>
    )
  }

  return (
    <>
      {/* avviso se l'aggiornamento all'avvio non è riuscito: si lavora comunque */}
      {erroreAvvio && (
        <div className="fixed inset-x-0 top-0 z-50 flex justify-center p-2">
          <div className="flex items-center gap-3 rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-800 shadow">
            Aggiornamento non riuscito: {erroreAvvio}
            <button onClick={() => setErroreAvvio(null)} className="font-medium underline">
              chiudi
            </button>
          </div>
        </div>
      )}

      {children}

      {/* banner arancione: aggiornamento uscito mentre il programma è aperto */}
      {stato.fase === 'disponibile' && !rimandato && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
          <div className="flex max-w-2xl flex-wrap items-center gap-4 rounded-xl bg-amber-500 px-5 py-3 text-white shadow-lg">
            <span className="flex items-center gap-2 text-sm font-medium">
              <IconaAggiornamento />
              È disponibile l'aggiornamento {stato.disponibile?.versione}
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => void dbLocale.aggiornamenti.installa()}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
              >
                Aggiorna subito
              </button>
              <button
                onClick={() => setRimandato(true)}
                title="Verrà installato automaticamente alla prossima apertura"
                className="rounded-lg border border-white/60 px-3 py-1.5 text-sm text-white transition hover:bg-amber-600"
              >
                Più tardi
              </button>
            </span>
          </div>
        </div>
      )}

      {/* aggiornamento avviato dal banner: schermata di avanzamento */}
      {inCorso && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-cielo-100/95 p-6 text-center">
          <img src={LOGO} alt="" className="h-24 w-24" />
          <p className="mt-4 text-cielo-700">
            {stato.fase === 'download'
              ? `Scaricamento aggiornamento ${stato.disponibile?.versione ?? ''}…`
              : 'Installazione in corso: il programma si riavvia da solo…'}
          </p>
          <div className="mt-4 h-2.5 w-72 overflow-hidden rounded-full bg-cielo-200">
            <div
              className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
              style={{ width: `${Math.max(4, stato.percentuale)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-cielo-500">{stato.percentuale}%</p>
        </div>
      )}
    </>
  )
}

function IconaAggiornamento() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}
