import { useEffect, useState } from 'react'
import { dbLocale } from '../lib/db'
import type { StatoCollegamenti } from '../lib/db'

/**
 * Riquadro per creare i collegamenti al programma (desktop e menu Start).
 * Usato sia al primo avvio sia, in seguito, dalla pagina Utenti.
 */
export default function Collegamenti({ onFatto }: { onFatto?: () => void }) {
  const [stato, setStato] = useState<StatoCollegamenti | null>(null)
  const [desktop, setDesktop] = useState(true)
  const [menuAvvio, setMenuAvvio] = useState(true)
  const [esito, setEsito] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function leggiStato() {
    const { data } = await dbLocale.collegamenti.stato()
    if (data) {
      setStato(data)
      setDesktop(!data.desktop)
      setMenuAvvio(!data.menuAvvio)
    }
  }

  useEffect(() => {
    void leggiStato()
  }, [])

  async function crea() {
    setErrore(null)
    setEsito(null)
    setAttesa(true)
    const { data, error } = await dbLocale.collegamenti.crea({ desktop, menuAvvio })
    setAttesa(false)
    if (error) {
      setErrore(error.message)
      return
    }
    const fatti = data?.fatti ?? []
    setEsito(fatti.length ? `Collegamento creato su: ${fatti.join(' e ')}.` : 'Nessun collegamento selezionato.')
    void leggiStato()
    onFatto?.()
  }

  return (
    <div>
      <div className="space-y-2">
        <Scelta
          attiva={desktop}
          onCambia={setDesktop}
          titolo="Sul desktop"
          desc={stato?.desktop ? 'Già presente: verrà ricreato aggiornato.' : "Icona sulla scrivania, per aprire l'app con un doppio clic."}
        />
        <Scelta
          attiva={menuAvvio}
          onCambia={setMenuAvvio}
          titolo="Nel menu Start"
          desc={
            stato?.menuAvvio
              ? 'Già presente: verrà ricreato aggiornato.'
              : "L'app compare fra i programmi e si trova cercando «TRAVI»."
          }
        />
      </div>

      {errore && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
      {esito && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{esito}</p>}

      <button
        onClick={() => void crea()}
        disabled={attesa || (!desktop && !menuAvvio)}
        className="mt-4 rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-40"
      >
        {attesa ? 'Creazione…' : 'Crea i collegamenti'}
      </button>

      <div className="mt-5 rounded-xl bg-cielo-50 p-4 text-sm leading-relaxed text-cielo-700">
        <b>Barra delle applicazioni.</b> Windows non permette ai programmi di aggiungersi da soli alla barra in
        basso: si fa a mano, una volta sola. Apri il menu Start, cerca <b>TRAVI</b>, fai clic destro sull'icona e
        scegli <i>Aggiungi alla barra delle applicazioni</i>. In alternativa:
        <button
          onClick={() => void dbLocale.collegamenti.mostraCartella()}
          className="ml-1 font-medium text-cielo-600 underline hover:text-cielo-800"
        >
          apri la cartella del programma
        </button>{' '}
        e trascina l'icona sulla barra.
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
