import { useEffect, useState } from 'react'
import {
  statoArchivioFile,
  creaFileArchivio,
  apriArchivioDaFile,
  salvaArchivioOra,
  scollegaFileArchivio,
} from '../lib/dbBrowser'
import type { StatoArchivioFile } from '../lib/dbBrowser'

/**
 * Pannello "Archivio su file": collega l'archivio a un file vero del computer.
 * Il file sopravvive alle pulizie del browser e può essere aperto anche da un
 * browser diverso (stessi dati ovunque). Solo versione browser.
 */
export default function ArchivioFilePannello() {
  const [stato, setStato] = useState<StatoArchivioFile | null>(null)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [confermaApertura, setConfermaApertura] = useState(false)

  async function aggiorna() {
    setStato(await statoArchivioFile())
  }

  useEffect(() => {
    void aggiorna()
  }, [])

  async function crea() {
    setMessaggio(null)
    setErrore(null)
    const esito = await creaFileArchivio()
    if (esito.messaggio) (esito.ok ? setMessaggio : setErrore)(esito.messaggio)
    void aggiorna()
  }

  async function apri() {
    setMessaggio(null)
    setErrore(null)
    setConfermaApertura(false)
    const esito = await apriArchivioDaFile()
    if (!esito.ok) {
      if (esito.messaggio) setErrore(esito.messaggio)
      return
    }
    // utenti e dati sono cambiati: si riparte puliti dal login
    window.location.reload()
  }

  async function salvaOra() {
    setMessaggio(null)
    setErrore(null)
    const esito = await salvaArchivioOra()
    ;(esito.ok ? setMessaggio : setErrore)(esito.messaggio)
    void aggiorna()
  }

  async function scollega() {
    await scollegaFileArchivio()
    setMessaggio('File scollegato: i dati restano solo nella memoria del browser.')
    void aggiorna()
  }

  if (!stato) return <p className="text-sm text-cielo-500">Caricamento…</p>

  return (
    <div>
      {stato.collegato ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p>
            ✅ Archivio collegato al file <b>{stato.nomeFile}</b>
            {stato.ultimoSalvataggio && (
              <> — ultimo salvataggio {new Date(stato.ultimoSalvataggio).toLocaleString('it-IT')}</>
            )}
            .
          </p>
          <p className="mt-1 text-xs opacity-80">
            Ogni modifica viene salvata anche lì, e a ogni apertura o accesso il browser si riallinea dal file:
            puoi usare Edge e Chrome alternandoli, i dati sono sempre gli stessi. In un browser nuovo basta
            scegliere questo file una volta con «Apri l'archivio dal file salvato».
            {stato.permesso !== 'granted' && (
              <>
                {' '}
                <b>Nota:</b> il browser richiederà una conferma al prossimo salvataggio.
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          <b>Consigliato.</b> Adesso i dati vivono solo nella memoria di questo browser: una «pulizia dati» li
          cancellerebbe. Collegando un file (per esempio in Documenti), tutto viene salvato anche lì: il file
          sopravvive alle pulizie, si può copiare come backup e si può aprire da un altro browser.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {stato.collegato ? (
          <>
            <button
              onClick={() => void salvaOra()}
              className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
            >
              Salva ora
            </button>
            <button
              onClick={() => setConfermaApertura(true)}
              className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
            >
              Apri un altro archivio
            </button>
            <button
              onClick={() => void scollega()}
              className="rounded-lg px-4 py-2 text-sm text-cielo-500 transition hover:bg-cielo-100"
            >
              Scollega
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => void crea()}
              className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
            >
              Crea il file dell'archivio
            </button>
            <button
              onClick={() => setConfermaApertura(true)}
              className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
            >
              Apri archivio esistente
            </button>
          </>
        )}
      </div>

      {confermaApertura && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>
            Aprendo un archivio da file, <b>i dati presenti in questo browser vengono sostituiti</b> (utenti
            compresi: rientrerai con le credenziali contenute nell'archivio).
          </p>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => void apri()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Ho capito, scegli il file
            </button>
            <button
              onClick={() => setConfermaApertura(false)}
              className="rounded-lg px-4 py-2 text-sm text-red-700 transition hover:bg-red-100"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {messaggio && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{messaggio}</p>}
      {errore && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
    </div>
  )
}
