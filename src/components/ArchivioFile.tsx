import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  statoArchivioFile,
  scegliPosizioneArchivio,
  apriArchivioDaFile,
  salvaArchivioOra,
  creaNuovoArchivio,
  esportaCopiaArchivio,
  importaDatiDaArchivio,
  elencaBackup,
  ripristinaDaBackup,
  cancellaArchivioFile,
} from '../lib/dbBrowser'
import type { StatoArchivioFile, VoceBackup } from '../lib/dbBrowser'
import { dbLocale } from '../lib/db'
import { useToast } from '../hooks/useToast'
import ConfermaCodice from './ConfermaCodice'

/**
 * Pannello "Archivio su file": l'archivio vive in una cartella scelta
 * dall'utente (di norma Documenti), insieme alla sottocartella "backup" con le
 * copie datate. Da qui si sceglie la posizione, si salva, si ripristina una
 * copia e si cancella l'archivio. Solo versione browser.
 */
export default function ArchivioFilePannello() {
  const toast = useToast()
  const [stato, setStato] = useState<StatoArchivioFile | null>(null)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [chiediPosizione, setChiediPosizione] = useState(false)
  const [confermaApertura, setConfermaApertura] = useState(false)
  const [confermaImporta, setConfermaImporta] = useState(false)
  const [confermaNuovo, setConfermaNuovo] = useState(false)
  const [confermaCancella, setConfermaCancella] = useState(false)
  const [confermaMonitoraggio, setConfermaMonitoraggio] = useState(false)
  const [copie, setCopie] = useState<VoceBackup[] | null>(null)
  const [copiaScelta, setCopiaScelta] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)

  async function aggiorna() {
    setStato(await statoArchivioFile())
  }

  useEffect(() => {
    void aggiorna()
  }, [])

  function ripulisci() {
    setMessaggio(null)
    setErrore(null)
  }

  /** Ogni esito si vede due volte: nel riquadro e come avviso a comparsa. */
  function mostraEsito(esito: { ok: boolean; messaggio: string }) {
    if (!esito.messaggio) return // operazione annullata: non c'è niente da dire
    ;(esito.ok ? setMessaggio : setErrore)(esito.messaggio)
    ;(esito.ok ? toast.ok : toast.errore)(esito.messaggio)
  }

  function mostraAvvisoCopieVuote(testo: string) {
    setErrore(testo)
    toast.avviso(testo)
  }

  async function scegliPosizione() {
    ripulisci()
    setChiediPosizione(false)
    const esito = await scegliPosizioneArchivio()
    mostraEsito(esito)
    void aggiorna()
  }

  async function apri() {
    ripulisci()
    setConfermaApertura(false)
    const esito = await apriArchivioDaFile()
    if (!esito.ok) {
      mostraEsito({ ok: false, messaggio: esito.messaggio })
      return
    }
    if (esito.soloDati) {
      mostraEsito({ ok: true, messaggio: esito.messaggio })
      setChiediPosizione(true)
      void aggiorna()
      return
    }
    // utenti e dati sono cambiati: si riparte puliti dal login
    window.location.reload()
  }

  async function salvaOra() {
    ripulisci()
    setAttesa(true)
    const esito = await salvaArchivioOra()
    setAttesa(false)
    mostraEsito(esito)
    void aggiorna()
  }

  async function esportaCopia() {
    ripulisci()
    const esito = await esportaCopiaArchivio()
    mostraEsito(esito)
  }

  async function importaDati() {
    ripulisci()
    setConfermaImporta(false)
    const esito = await importaDatiDaArchivio()
    mostraEsito(esito)
    if (esito.ok) setChiediPosizione(true)
    void aggiorna()
  }

  async function nuovoArchivio() {
    ripulisci()
    setConfermaNuovo(false)
    const esito = await creaNuovoArchivio()
    mostraEsito(esito)
    void aggiorna()
  }

  async function cancella() {
    ripulisci()
    setConfermaCancella(false)
    const esito = await cancellaArchivioFile()
    mostraEsito(esito)
    setCopie(null)
    void aggiorna()
  }

  /** Via i dati del vecchio monitoraggio: restano immobili, lettere e allegati. */
  async function pulisciMonitoraggio() {
    ripulisci()
    setConfermaMonitoraggio(false)
    setAttesa(true)
    const { data, error } = await dbLocale.bm.pulisciSenzaLettera()
    setAttesa(false)
    if (error) {
      mostraEsito({ ok: false, messaggio: error.message })
      return
    }
    mostraEsito({
      ok: true,
      messaggio:
        data && data > 0
          ? `Eliminate ${data} schede senza lettera: gli immobili e i dati che vengono dai documenti restano.`
          : "Non c'era nessuna scheda senza lettera: niente da eliminare.",
    })
  }

  async function mostraCopie() {
    ripulisci()
    setAttesa(true)
    const elenco = await elencaBackup()
    setAttesa(false)
    setCopie(elenco)
    if (elenco.length === 0) {
      mostraAvvisoCopieVuote(
        stato?.cartella
          ? 'Nessuna copia di sicurezza ancora presente: usa «Salva ora» per crearne una.'
          : 'Per avere le copie di sicurezza imposta prima la posizione dell\'archivio.',
      )
    }
  }

  async function ripristina() {
    if (!copiaScelta) return
    ripulisci()
    const nome = copiaScelta
    setCopiaScelta(null)
    setAttesa(true)
    const esito = await ripristinaDaBackup(nome)
    setAttesa(false)
    mostraEsito(esito)
    void aggiorna()
  }

  if (!stato) return <p className="text-sm text-cielo-500">Caricamento…</p>

  const posizione = stato.cartella ? `${stato.cartella}\\${stato.nomeFile}` : stato.nomeFile

  return (
    <div>
      {stato.collegato ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p>
            ✅ Archivio in uso: <b>{posizione}</b>
            {stato.ultimoSalvataggio && (
              <> — ultimo salvataggio {new Date(stato.ultimoSalvataggio).toLocaleString('it-IT')}</>
            )}
            .
          </p>
          <p className="mt-1 text-xs opacity-80">
            Ogni modifica viene salvata anche lì, e a ogni apertura o accesso il browser si riallinea dal file:
            puoi usare Edge e Chrome alternandoli, i dati sono sempre gli stessi.
            {stato.cartella
              ? ` Le copie di sicurezza stanno in ${stato.cartella}\\backup.`
              : ' Per avere anche le copie di sicurezza scegli la posizione dell\'archivio.'}
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
          <b>Nessun archivio in uso.</b> Adesso i dati vivono solo nella memoria di questo browser: una
          «pulizia dati» li cancellerebbe. Scegli la posizione dell'archivio (di norma Documenti): il file
          sopravvive alle pulizie, si può copiare come backup e si può aprire da un altro browser.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {stato.collegato && (
          <button
            onClick={() => void salvaOra()}
            disabled={attesa}
            className="rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600 disabled:opacity-50"
          >
            Salva ora
          </button>
        )}
        <button
          onClick={() => void scegliPosizione()}
          className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
        >
          Scegli la posizione dell'archivio
        </button>
        <button
          onClick={() => setConfermaApertura(true)}
          className="rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50"
        >
          {stato.collegato ? 'Apri un altro archivio' : 'Apri archivio esistente'}
        </button>
      </div>

      {chiediPosizione && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p>
            {stato.collegato ? (
              <>
                I dati sono stati scritti in <b>{posizione}</b>. Vuoi conservarli altrove?
              </>
            ) : (
              <>
                I dati sono nel browser ma <b>non sono ancora su un file</b>: scegli dove salvarli.
              </>
            )}
          </p>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => void scegliPosizione()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
            >
              Scegli la posizione dell'archivio
            </button>
            <button
              onClick={() => setChiediPosizione(false)}
              className="rounded-lg px-4 py-2 text-sm text-amber-700 transition hover:bg-amber-100"
            >
              {stato.collegato ? 'Va bene così' : 'Più tardi'}
            </button>
          </div>
        </div>
      )}

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

      {/* ---- copie di sicurezza ---- */}
      <div className="mt-6 border-t border-cielo-200 pt-4">
        <h3 className="text-sm font-semibold text-cielo-800">Copie di sicurezza</h3>
        <p className="mt-1 text-xs text-cielo-600">
          Ogni volta che premi «Salva ora» viene messa una copia datata nella cartella <b>backup</b>, accanto
          all'archivio (ne restano le 30 più recenti). Da qui puoi tornare indietro a una di quelle copie.
        </p>
        <button
          onClick={() => void mostraCopie()}
          disabled={attesa}
          className="mt-3 rounded-lg border border-cielo-300 px-4 py-2 text-sm text-cielo-700 transition hover:bg-cielo-50 disabled:opacity-50"
        >
          {attesa ? 'Attendere…' : 'Mostra le copie disponibili'}
        </button>
        {copie && copie.length > 0 && (
          <ul className="mt-3 divide-y divide-cielo-100 rounded-xl border border-cielo-200">
            {copie.map((c) => (
              <li key={c.nome} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-cielo-800">{c.nome}</span>
                  <span className="block text-xs text-cielo-500">
                    {new Date(c.data).toLocaleString('it-IT')} · {(c.dimensione / 1024).toFixed(1)} KB
                  </span>
                </span>
                <button
                  onClick={() => setCopiaScelta(c.nome)}
                  className="shrink-0 rounded-lg border border-cielo-300 px-3 py-1.5 text-xs text-cielo-700 transition hover:bg-cielo-50"
                >
                  Ripristina
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- operazioni delicate ---- */}
      <div className="mt-6 border-t border-cielo-200 pt-4">
        <h3 className="text-sm font-semibold text-cielo-800">Operazioni delicate</h3>
        <p className="mt-1 text-xs text-cielo-600">
          Richiedono la digitazione di un codice di conferma: servono a non farle per sbaglio.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={() => setConfermaMonitoraggio(true)}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 transition hover:bg-red-50"
          >
            Cancella i dati del monitoraggio
          </button>
          <button
            onClick={() => setConfermaNuovo(true)}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 transition hover:bg-red-50"
          >
            Crea un nuovo archivio (azzera i dati)
          </button>
          {stato.collegato && (
            <button
              onClick={() => setConfermaCancella(true)}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 transition hover:bg-red-50"
            >
              Cancella archivio
            </button>
          )}
        </div>
      </div>

      {confermaMonitoraggio && (
        <ConfermaCodice
          titolo="Cancellare i dati del monitoraggio?"
          azione="Cancella quei dati"
          onAnnulla={() => setConfermaMonitoraggio(false)}
          onConferma={() => void pulisciMonitoraggio()}
        >
          <p>
            Se ne vanno tutte le schede di Building Management <b>senza Lettera di attivazione</b>: sono quelle
            arrivate dal vecchio foglio di monitoraggio (fornitore, categoria, report, bimestri).
          </p>
          <p className="mt-2">
            <b>Restano</b> gli immobili con i loro dati di anagrafica e tutte le schede che nascono da una
            lettera, con i relativi allegati.
          </p>
        </ConfermaCodice>
      )}

      {confermaNuovo && (
        <ConfermaCodice
          titolo="Creare un nuovo archivio?"
          azione="Crea il nuovo archivio"
          onAnnulla={() => setConfermaNuovo(false)}
          onConferma={() => void nuovoArchivio()}
        >
          <b>Tutti i dati attuali andranno persi</b> (immobili e preferenze). Gli <b>utenti vengono mantenuti</b>{' '}
          e travasati nel nuovo archivio — altrimenti non potresti più entrare. Ti verrà chiesta la cartella
          dove salvarlo, e prima di azzerare viene messa una copia di sicurezza nella cartella backup.
        </ConfermaCodice>
      )}

      {confermaCancella && (
        <ConfermaCodice
          titolo="Cancellare l'archivio dal computer?"
          azione="Cancella l'archivio"
          onAnnulla={() => setConfermaCancella(false)}
          onConferma={() => void cancella()}
        >
          Il file <b>{posizione}</b> viene eliminato dal computer. Prima della cancellazione ne viene messa una
          copia nella cartella <b>backup</b>, che <b>non</b> viene toccata: da lì si può sempre ripristinare. I
          dati restano visibili in questo browser finché non scegli una nuova posizione.
        </ConfermaCodice>
      )}

      {copiaScelta && (
        <ConfermaCodice
          titolo="Ripristinare questa copia?"
          azione="Ripristina la copia"
          onAnnulla={() => setCopiaScelta(null)}
          onConferma={() => void ripristina()}
        >
          I dati attuali verranno <b>sostituiti</b> con quelli di <b>{copiaScelta}</b>, utenti e password
          compresi (se in quella copia il tuo account non c'era, dovrai rientrare con le credenziali di
          allora). Lo stato di adesso viene comunque salvato in una nuova copia prima del ripristino.
        </ConfermaCodice>
      )}

      {messaggio && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{messaggio}</p>}
      {errore && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
    </div>
  )
}
