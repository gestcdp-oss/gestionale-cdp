import { useState } from 'react'
import { dbLocale } from '../lib/db'
import Collegamenti from '../components/Collegamenti'

const LOGO = './logo.svg'

/**
 * Mostrata una sola volta, subito dopo la creazione del primo utente:
 * propone di creare i collegamenti per ritrovare facilmente il programma.
 */
export default function PrimoAvvioPage({ onFine }: { onFine: () => void }) {
  const [fatto, setFatto] = useState(false)

  async function nonOra() {
    await dbLocale.collegamenti.rimanda()
    onFine()
  }

  return (
    <div className="flex min-h-full items-center justify-center overflow-y-auto bg-cielo-100 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-cielo-200 bg-panna p-8 shadow-sm">
        <div className="text-center">
          <img src={LOGO} alt="" className="mx-auto h-20 w-20" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-cielo-800">Benvenuto in TR.A.V.I.</h1>
          <p className="mt-1 text-sm text-cielo-600">
            Vuoi aggiungere il programma dove ti è più comodo trovarlo?
          </p>
        </div>

        <div className="mt-6">
          <Collegamenti onFatto={() => setFatto(true)} />
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-cielo-200 pt-5">
          <button
            onClick={() => void nonOra()}
            className="rounded-lg px-4 py-2 text-sm text-cielo-600 transition hover:bg-cielo-100"
          >
            {fatto ? 'Chiudi' : 'Non ora'}
          </button>
          <button
            onClick={onFine}
            className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
          >
            Inizia a usare il programma
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-cielo-500">
          Potrai aggiungerli anche più avanti da <b>Utenti › Collegamenti sul computer</b>.
        </p>
      </div>
    </div>
  )
}
