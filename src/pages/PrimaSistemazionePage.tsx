import { useState } from 'react'
import { dbLocale } from '../lib/db'

const LOGO = './logo.svg'

/**
 * Prima schermata quando il programma viene avviato da una cartella qualsiasi
 * (di solito i download): si sistema da solo in una posizione stabile, crea i
 * collegamenti e riparte da lì. Un solo pulsante, nessuna scelta tecnica.
 */
export default function PrimaSistemazionePage({
  destinazione,
  onRifiuta,
}: {
  destinazione: string
  onRifiuta: () => void
}) {
  const [desktop, setDesktop] = useState(true)
  const [menu, setMenu] = useState(true)
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function sistema() {
    setErrore(null)
    setAttesa(true)
    const { error } = await dbLocale.sistemazione.esegui({
      collegamentoDesktop: desktop,
      collegamentoMenu: menu,
    })
    if (error) {
      setAttesa(false)
      setErrore(error.message)
      return
    }
    // in caso di riuscita il programma riparte da solo dalla nuova posizione
  }

  async function usaQui() {
    await dbLocale.sistemazione.rifiuta()
    onRifiuta()
  }

  return (
    <div className="flex min-h-full items-center justify-center overflow-y-auto bg-cielo-100 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-cielo-200 bg-panna p-8 shadow-sm">
        <div className="text-center">
          <img src={LOGO} alt="" className="mx-auto h-24 w-24" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-cielo-800">Benvenuto in TR.A.V.I.</h1>
          <p className="mt-2 text-sm leading-relaxed text-cielo-600">
            Prima di cominciare, il programma si sistema in una cartella sicura del tuo computer, così i dati
            che inserirai non rischiano di finire persi tra i file scaricati.
          </p>
        </div>

        {attesa ? (
          <div className="mt-8 text-center">
            <p className="text-cielo-700">Sistemazione in corso… il programma si riaprirà da solo.</p>
            <div className="mx-auto mt-4 h-2.5 w-56 overflow-hidden rounded-full bg-cielo-200">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-500" />
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-2">
              <Scelta
                attiva={desktop}
                onCambia={setDesktop}
                titolo="Metti l'icona sul desktop"
                desc="Per aprire il programma con un doppio clic dalla scrivania."
              />
              <Scelta
                attiva={menu}
                onCambia={setMenu}
                titolo="Aggiungi al menu Start"
                desc="Per trovarlo cercando «TRAVI» fra i programmi."
              />
            </div>

            {errore && (
              <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                <p>
                  <b>Non è stato possibile sistemare il programma</b> su questo computer: probabilmente le
                  impostazioni di sicurezza aziendali non lo consentono.
                </p>
                <p className="mt-2 text-xs opacity-80">Dettaglio tecnico: {errore}</p>
                <p className="mt-2">
                  Nessun problema: puoi usarlo comunque da qui. Sposta però il file in una cartella tua (per
                  esempio in Documenti) e non nei download, così i dati non rischiano di essere cancellati.
                </p>
                <button
                  onClick={() => void usaQui()}
                  className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
                >
                  Continua da questa cartella
                </button>
              </div>
            )}

            <button
              onClick={() => void sistema()}
              className="mt-6 w-full rounded-xl bg-cielo-500 py-3 font-medium text-white transition hover:bg-cielo-600"
            >
              Sistema il programma e apri
            </button>

            <p className="mt-4 text-center text-xs leading-relaxed text-cielo-500">
              Verrà copiato in <span className="break-all font-mono">{destinazione}</span>
              <br />
              Dopo potrai cancellare il file che hai scaricato.
            </p>

            <div className="mt-4 text-center">
              <button onClick={() => void usaQui()} className="text-xs text-cielo-500 underline hover:text-cielo-700">
                Preferisco usarlo dalla cartella in cui si trova ora
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Scelta({
  attiva,
  onCambia,
  titolo,
  desc,
}: {
  attiva: boolean
  onCambia: (v: boolean) => void
  titolo: string
  desc: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
        attiva ? 'border-cielo-400 bg-cielo-50' : 'border-cielo-200 hover:bg-cielo-50'
      }`}
    >
      <input
        type="checkbox"
        checked={attiva}
        onChange={(e) => onCambia(e.target.checked)}
        className="mt-0.5 accent-cielo-600"
      />
      <span>
        <span className="block text-sm font-medium text-cielo-800">{titolo}</span>
        <span className="mt-0.5 block text-xs text-cielo-600">{desc}</span>
      </span>
    </label>
  )
}
