import { useEffect, useState } from 'react'
import {
  statoArchivioFile,
  creaFileArchivio,
  apriArchivioDaFile,
  salvaArchivioOra,
  creaNuovoArchivio,
  esportaCopiaArchivio,
  importaDatiDaArchivio,
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
  const [confermaImporta, setConfermaImporta] = useState(false)
  const [confermaNuovo, setConfermaNuovo] = useState(false)

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
    if (esito.soloDati) {
      // file di soli dati: gli immobili sono entrati, l'archivio resta il tuo
      setMessaggio(esito.messaggio)
      void aggiorna()
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

  async function esportaCopia() {
    setMessaggio(null)
    setErrore(null)
    const esito = await esportaCopiaArchivio()
    ;(esito.ok ? setMessaggio : setErrore)(esito.messaggio)
  }

  async function importaDati() {
    setMessaggio(null)
    setErrore(null)
    setConfermaImporta(false)
    const esito = await importaDatiDaArchivio()
    if (esito.messaggio) (esito.ok ? setMessaggio : setErrore)(esito.messaggio)
  }

  async function nuovoArchivio() {
    setMessaggio(null)
    setErrore(null)
    setConfermaNuovo(false)
    const esito = await creaNuovoArchivio()
    if (esito.messaggio) (esito.ok ? setMessaggio : setErrore)(esito.messaggio)
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
            compresi: rientrerai con le credenziali contenute nell'archivio). Se invece scegli un file di{' '}
            <b>soli dati</b> (.travidati) vengono sostituiti solo gli immobili, e i tuoi utenti restano.
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

      {/* ---- scambio con i colleghi ---- */}
      <div className="mt-6 border-t border-cielo-200 pt-4">
        <h3 className="text-sm font-semibold text-cielo-800">Scambio con i colleghi</h3>
        <p className="mt-1 text-xs text-cielo-600">
          Esporta una copia da inviare, oppure importa i dati da un archivio che hai ricevuto:{' '}
          <b>i tuoi utenti e la tua password restano invariati</b>.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={() => void esportaCopia()}
            className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
          >
            Esporta una copia (da inviare)
          </button>
          <button
            onClick={() => setConfermaImporta(true)}
            className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
          >
            Importa dati da un archivio ricevuto
          </button>
        </div>
        {confermaImporta && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p>
              Gli <b>immobili presenti verranno sostituiti</b> con quelli del file ricevuto. I tuoi utenti, la
              tua password e le tue preferenze <b>non cambiano</b>.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => void importaDati()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
              >
                Ho capito, scegli il file
              </button>
              <button
                onClick={() => setConfermaImporta(false)}
                className="rounded-lg px-4 py-2 text-sm text-amber-700 transition hover:bg-amber-100"
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- nuovo archivio (azzera) ---- */}
      <div className="mt-6 border-t border-cielo-200 pt-4">
        <h3 className="text-sm font-semibold text-cielo-800">Ricomincia da zero</h3>
        <p className="mt-1 text-xs text-cielo-600">
          Crea un archivio nuovo e vuoto, salvato in un nuovo file.
        </p>
        <button
          onClick={() => setConfermaNuovo(true)}
          className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 transition hover:bg-red-50"
        >
          Crea un nuovo archivio
        </button>
        {confermaNuovo && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>
              <b>Tutti i dati attuali andranno persi</b> (immobili e preferenze). Gli <b>utenti vengono
              mantenuti</b> e travasati nel nuovo archivio — altrimenti non potresti più entrare. Prima
              dell'azzeramento viene scaricata automaticamente una copia di sicurezza dei dati.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                onClick={() => void nuovoArchivio()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Ho capito, crea il nuovo archivio
              </button>
              <button
                onClick={() => setConfermaNuovo(false)}
                className="rounded-lg px-4 py-2 text-sm text-red-700 transition hover:bg-red-100"
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>

      {messaggio && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{messaggio}</p>}
      {errore && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
    </div>
  )
}
