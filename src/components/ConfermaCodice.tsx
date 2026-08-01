import { useState } from 'react'
import type { ReactNode } from 'react'

/** Codice di 5 caratteri: lettere, numeri e simboli, senza quelli ambigui. */
export function generaCodice(): string {
  const lettere = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const numeri = '23456789'
  const simboli = '#@%&*?!$'
  const tutti = lettere + numeri + simboli
  const uno = (s: string) => s[Math.floor(Math.random() * s.length)]
  const scelti = [uno(lettere), uno(numeri), uno(simboli), uno(tutti), uno(tutti)]
  for (let i = scelti.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[scelti[i], scelti[j]] = [scelti[j], scelti[i]]
  }
  return scelti.join('')
}

/**
 * Conferma "a prova di clic distratto": per procedere bisogna ricopiare un
 * codice generato al momento (maiuscole e minuscole sono uguali).
 */
export default function ConfermaCodice({
  titolo,
  azione,
  children,
  onAnnulla,
  onConferma,
}: {
  titolo: string
  azione: string
  children: ReactNode
  onAnnulla: () => void
  onConferma: () => void
}) {
  const [codice] = useState(generaCodice)
  const [scritto, setScritto] = useState('')
  const combacia = scritto.trim().toUpperCase() === codice

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-panna p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-red-800">{titolo}</h3>
        <div className="mt-2 text-sm leading-relaxed text-cielo-700">{children}</div>

        <p className="mt-4 text-sm text-cielo-700">
          Per procedere ricopia questo codice:{' '}
          <span className="select-all rounded-lg bg-red-100 px-3 py-1 font-mono text-base font-bold tracking-[0.3em] text-red-800">
            {codice}
          </span>
        </p>
        <input
          value={scritto}
          onChange={(e) => setScritto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && combacia) onConferma()
            if (e.key === 'Escape') onAnnulla()
          }}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          placeholder="codice di conferma"
          className="mt-2 w-full rounded-lg border border-cielo-300 px-3 py-2 font-mono text-base tracking-[0.2em] outline-none focus:border-cielo-500"
        />

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onAnnulla}
            className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
          >
            Annulla
          </button>
          <button
            onClick={onConferma}
            disabled={!combacia}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {azione}
          </button>
        </div>
      </div>
    </div>
  )
}
