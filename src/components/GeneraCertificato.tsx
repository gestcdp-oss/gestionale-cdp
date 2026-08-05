import { useState } from 'react'
import Finestra from './Finestra'
import { MESI, MESI_BREVI, mesiPerEsteso } from '../lib/tipi'
import type { CertificatoBM } from '../lib/tipi'

/**
 * Generazione del Certificato di Avvenuta Prestazione, dentro una finestra che
 * si sposta e si ridimensiona. Primo passo: la scelta dei mesi. Si possono
 * scegliere solo i mesi con tutti i report consegnati; quelli già certificati
 * bloccano la procedura, perché due certificati sullo stesso mese non possono
 * esistere.
 */
export default function GeneraCertificato({
  anno,
  denominazione,
  report,
  attesiAlMese,
  certificati,
  onChiudi,
  onContinua,
}: {
  anno: number
  denominazione: string
  /** report consegnati mese per mese */
  report: number[]
  attesiAlMese: number
  certificati: CertificatoBM[]
  onChiudi: () => void
  onContinua: (mesi: number[]) => void
}) {
  const [scelti, setScelti] = useState<number[]>([])

  // mese per mese: completo se ha tutti i report che servono
  const completi = MESI_BREVI.map((_, i) => (report[i] ?? 0) >= attesiAlMese)
  const giaCertificati = new Set(certificati.flatMap((c) => c.mesi))
  const nessunMeseCompleto = !completi.some(Boolean)
  const sceltiGiaCertificati = scelti.filter((m) => giaCertificati.has(m))
  const bloccato = sceltiGiaCertificati.length > 0

  function commuta(mese: number) {
    setScelti((s) => (s.includes(mese) ? s.filter((m) => m !== mese) : [...s, mese].sort((a, b) => a - b)))
  }

  return (
    <Finestra
      titolo={`Certificato di Avvenuta Prestazione · ${denominazione} · ${anno}`}
      larghezza={760}
      altezza={520}
      onChiudi={onChiudi}
      icona={<IconaCertificato />}
    >
      <div className="flex h-full flex-col overflow-y-auto bg-panna p-6">
        {nessunMeseCompleto ? (
          /* senza nemmeno un mese completo non c'è niente da certificare */
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-4xl">🚫</p>
            <h3 className="mt-3 text-lg font-semibold text-red-800">Non ci sono mesi completi</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-cielo-700">
              Per generare il certificato serve almeno un mese con <b>tutti i report consegnati</b> (ne servono{' '}
              {attesiAlMese} al mese). Segna le consegne mancanti e riprova.
            </p>
            <button
              onClick={onChiudi}
              className="mt-5 rounded-lg bg-cielo-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-cielo-800">
              Per quale mese o mesi vuoi generare il certificato?
            </h3>
            <p className="mt-1 text-sm text-cielo-600">
              Sono scegliibili solo i mesi con tutti i report consegnati. In giallo quelli per cui un
              certificato esiste già.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {MESI_BREVI.map((mese, i) => {
                const numero = i + 1
                const completo = completi[i]
                const certificato = giaCertificati.has(numero)
                const scelto = scelti.includes(numero)
                const stile = !completo
                  ? 'cursor-not-allowed border-cielo-200 bg-cielo-50 text-cielo-300'
                  : certificato
                    ? scelto
                      ? 'border-amber-500 bg-amber-200 text-amber-900'
                      : 'border-amber-300 bg-amber-100 text-amber-800 hover:border-amber-500'
                    : scelto
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-500'
                return (
                  <button
                    key={mese}
                    disabled={!completo}
                    onClick={() => commuta(numero)}
                    title={
                      !completo
                        ? `${MESI[i]}: report incompleti (${report[i] ?? 0} su ${attesiAlMese})`
                        : certificato
                          ? `${MESI[i]}: certificato già generato`
                          : `${MESI[i]}: pronto`
                    }
                    className={`h-14 w-20 rounded-lg border-2 text-sm font-semibold transition ${stile}`}
                  >
                    <span className="block uppercase tracking-wide">{mese}</span>
                    <span className="block text-xs font-normal">
                      {!completo ? `${report[i] ?? 0}/${attesiAlMese}` : certificato ? 'già fatto' : 'pronto'}
                    </span>
                  </button>
                )
              })}
            </div>

            {bloccato && (
              <div className="mt-5 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-800">
                <b>Non si può proseguire.</b> Per{' '}
                <b>{mesiPerEsteso(sceltiGiaCertificati)}</b> esiste già un certificato di questa lettera: non
                è possibile generarne un altro per lo stesso mese. Cancella prima quello che c'è e rifallo.
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
              <span className="text-sm text-cielo-600">
                {scelti.length === 0
                  ? 'Nessun mese scelto'
                  : `${scelti.length} ${scelti.length === 1 ? 'mese scelto' : 'mesi scelti'}: ${mesiPerEsteso(
                      scelti,
                    )}`}
              </span>
              <span className="flex gap-3">
                <button
                  onClick={onChiudi}
                  className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
                >
                  Chiudi
                </button>
                {!bloccato && (
                  <button
                    onClick={() => onContinua(scelti)}
                    disabled={scelti.length === 0}
                    className="rounded-lg bg-cielo-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continua
                  </button>
                )}
              </span>
            </div>
          </>
        )}
      </div>
    </Finestra>
  )
}

function IconaCertificato() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cielo-600">
      <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <path d="M8 7h7M8 11h5" />
      <circle cx="17.5" cy="15.5" r="3.5" />
      <path d="M15.5 18.5 15 22l2.5-1.4L20 22l-.5-3.5" />
    </svg>
  )
}
