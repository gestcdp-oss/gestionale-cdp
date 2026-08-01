import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import { useSelezione } from '../hooks/useSelezione'
import { useToast } from '../hooks/useToast'
import { useImmobili } from '../hooks/useImmobili'
import { useMappa } from '../hooks/useMappa'
import { BIMESTRI, MESI_BREVI, STATI_AUTORIZZAZIONE, datiBMVuoti } from '../lib/tipi'
import type { BimestreBM, DatiBM, Immobile, LetteraBM, AllegatoBM } from '../lib/tipi'
import { giorniAlla } from '../lib/letteraAttivazione'
import CaricaLettera, { italiana } from '../components/CaricaLettera'
import type { EsitoLettera } from '../components/CaricaLettera'
import CaricaAllegati from '../components/CaricaAllegati'
import type { FileAnalizzato } from '../components/CaricaAllegati'
import FinestraDocumento from '../components/FinestraDocumento'
import { regioneDaLocalizzazione } from '../lib/regioni'

type Salvataggio = 'fermo' | 'in-corso' | 'salvato'

const ANNO_CORRENTE = new Date().getFullYear()

export default function BuildingManagerPage() {
  const { immobile } = useSelezione()
  const { immobili, caricamento: caricamentoImmobili } = useImmobili()
  const toast = useToast()
  const { apri: apriMappa } = useMappa()
  const dati = immobili.find((i) => i.id === immobile?.id) ?? null
  // rete di sicurezza: se l'immobile selezionato non è più nell'archivio, meglio
  // dirlo che mostrare una scheda vuota senza spiegazioni
  const immobileSparito = !caricamentoImmobili && immobili.length > 0 && !dati

  const [anno, setAnno] = useState(ANNO_CORRENTE)
  const [campi, setCampi] = useState<DatiBM>(datiBMVuoti)
  const [anni, setAnni] = useState<number[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [stato, setStato] = useState<Salvataggio>('fermo')
  const [errore, setErrore] = useState<string | null>(null)
  const [caricaLettera, setCaricaLettera] = useState(false)
  const [caricaAllegati, setCaricaAllegati] = useState(false)
  // documento aperto nella finestra trascinabile
  const [documentoAperto, setDocumentoAperto] = useState<string | null>(null)

  // il salvataggio parte da solo poco dopo l'ultima modifica
  const attesaSalvataggio = useRef<number | undefined>(undefined)
  const daSalvare = useRef(false)

  const immobileId = immobile?.id ?? ''

  // caricamento dell'incarico dell'anno scelto
  useEffect(() => {
    if (!immobileId) return
    let vivo = true
    setCaricamento(true)
    daSalvare.current = false
    window.clearTimeout(attesaSalvataggio.current)
    void dbLocale.bm.get(immobileId, anno).then(({ data }) => {
      if (!vivo) return
      setCampi(data ? estraiCampi(data) : datiBMVuoti())
      setCaricamento(false)
      setStato('fermo')
    })
    return () => {
      vivo = false
    }
  }, [immobileId, anno])

  // elenco degli anni già compilati, per il selettore
  useEffect(() => {
    if (!immobileId) return
    let vivo = true
    void dbLocale.bm.anni(immobileId).then(({ data }) => {
      if (vivo) setAnni(data ?? [])
    })
    return () => {
      vivo = false
    }
  }, [immobileId, stato])

  function modifica(cambio: Partial<DatiBM>) {
    setCampi((c) => {
      const nuovo = { ...c, ...cambio }
      programmaSalvataggio(nuovo)
      return nuovo
    })
  }

  function modificaBimestre(indice: number, cambio: Partial<BimestreBM>) {
    setCampi((c) => {
      const bimestri = c.bimestri.map((b, i) => (i === indice ? { ...b, ...cambio } : b))
      const nuovo = { ...c, bimestri }
      programmaSalvataggio(nuovo)
      return nuovo
    })
  }

  function programmaSalvataggio(valori: DatiBM) {
    if (!immobileId) return
    daSalvare.current = true
    setStato('in-corso')
    window.clearTimeout(attesaSalvataggio.current)
    attesaSalvataggio.current = window.setTimeout(() => void salva(valori), 700)
  }

  async function salva(valori: DatiBM) {
    setErrore(null)
    const { error } = await dbLocale.bm.salva(immobileId, anno, valori)
    daSalvare.current = false
    if (error) {
      setErrore(error.message)
      toast.errore(`Incarico non salvato: ${error.message}`)
      setStato('fermo')
      return
    }
    setStato('salvato')
  }

  // se si lascia la pagina con modifiche in sospeso, si salva subito
  useEffect(() => {
    return () => {
      if (daSalvare.current) {
        window.clearTimeout(attesaSalvataggio.current)
        void dbLocale.bm.salva(immobileId, anno, campiCorrenti.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immobileId, anno])

  const campiCorrenti = useRef(campi)
  campiCorrenti.current = campi

  /**
   * Registra i dati della lettera sugli immobili confermati e su tutti gli anni
   * coperti dall'incarico. Report mensili e bimestri di ogni anno non si
   * toccano: quelli vengono dal monitoraggio, non dalla lettera.
   */
  async function registraLettera(esito: EsitoLettera) {
    const { dati: l, nomeFile, file, immobili: bersagli } = esito
    // il file viene conservato nell'archivio, così la lettera si può riaprire
    const { data: documentoId, error: erroreFile } = await dbLocale.documenti.salva({
      nome: nomeFile,
      tipo: file.type || 'application/pdf',
      dimensione: file.size,
      contenuto: await base64Di(file),
    })
    if (erroreFile) {
      toast.errore(`Il file della lettera non è stato salvato: ${erroreFile.message}`)
      return
    }
    const lettera: LetteraBM = {
      nomeFile,
      caricataIl: new Date().toISOString(),
      fornitoreIndirizzo: l.fornitoreIndirizzo,
      accordoData: l.accordoData,
      accordoNome: l.accordoNome,
      tipoAttivazione: l.tipoAttivazione,
      codiceFiscaleBM: l.codiceFiscaleBM,
      importo: l.importo,
      compendi: l.compendi,
      documentoId,
      // una lettera nuova azzera gli allegati della precedente
      allegati: [],
    }
    const primo = Number((l.decorrenza ?? '').slice(0, 4)) || anno
    const ultimo = Number((l.scadenza ?? '').slice(0, 4)) || primo
    const anni: number[] = []
    for (let a = primo; a <= Math.min(ultimo, primo + 9); a++) anni.push(a)

    setCaricaLettera(false)
    setStato('in-corso')
    let scritti = 0
    for (const im of bersagli) {
      for (const a of anni) {
        const { data: esistente } = await dbLocale.bm.get(im.id, a)
        const base = esistente ? estraiCampi(esistente) : datiBMVuoti()
        const { error } = await dbLocale.bm.salva(im.id, a, {
          ...base,
          lettera,
          fornitore: l.fornitore ?? base.fornitore,
          nominativo: l.buildingManager ?? base.nominativo,
          periodo_dal: l.decorrenza ?? base.periodo_dal,
          periodo_al: l.scadenza ?? base.periodo_al,
        })
        if (error) {
          setStato('fermo')
          toast.errore(`Registrazione non riuscita: ${error.message}`)
          return
        }
        scritti++
      }
    }
    setStato('salvato')
    // i file non più richiamati da nessun incarico se ne vanno
    void dbLocale.documenti.pulisci()
    toast.ok(
      `Lettera registrata su ${bersagli.length} ${bersagli.length === 1 ? 'immobile' : 'immobili'}` +
        (anni.length > 1 ? ` per gli anni ${anni.join(', ')}` : ` (${anni[0]})`) +
        `: ${scritti} schede aggiornate.`,
    )
    // ricarico la scheda dell'anno che sto guardando
    const { data } = await dbLocale.bm.get(immobileId, anno)
    setCampi(data ? estraiCampi(data) : datiBMVuoti())
  }

  /**
   * Registra gli allegati: ognuno viene conservato e agganciato all'incarico
   * dell'immobile che gli appartiene, su tutti gli anni dell'incarico.
   */
  async function registraAllegati(scelti: FileAnalizzato[]) {
    setCaricaAllegati(false)
    setStato('in-corso')
    const primo = Number((campi.periodo_dal ?? '').slice(0, 4)) || anno
    const ultimo = Number((campi.periodo_al ?? '').slice(0, 4)) || primo
    const anni: number[] = []
    for (let a = primo; a <= Math.min(ultimo, primo + 9); a++) anni.push(a)

    let registrati = 0
    for (const scelto of scelti) {
      if (!scelto.immobile) continue
      const { data: documentoId, error } = await dbLocale.documenti.salva({
        nome: scelto.file.name,
        tipo: scelto.file.type || 'application/pdf',
        dimensione: scelto.file.size,
        contenuto: await base64Di(scelto.file),
      })
      if (error || !documentoId) {
        toast.errore(`"${scelto.file.name}" non è stato salvato: ${error?.message ?? 'errore'}`)
        continue
      }
      const allegato: AllegatoBM = {
        documentoId,
        nome: scelto.file.name,
        asset: scelto.scheda?.asset ?? null,
        sito: scelto.scheda?.sito ?? null,
        lotto: scelto.scheda?.lotto ?? null,
        committente: scelto.scheda?.committente ?? null,
        classe: scelto.scheda?.classe ?? null,
        appaltatore: scelto.scheda?.appaltatore ?? null,
        dal: scelto.scheda?.dal ?? null,
        al: scelto.scheda?.al ?? null,
        importoTotale: scelto.scheda?.importoTotale ?? null,
      }
      for (const a of anni) {
        const { data: esistente } = await dbLocale.bm.get(scelto.immobile.id, a)
        const base = esistente ? estraiCampi(esistente) : datiBMVuoti()
        if (!base.lettera) continue // niente lettera per quell'anno: si salta
        // stesso allegato caricato di nuovo: sostituisce il precedente
        const altri = base.lettera.allegati.filter((x) => x.nome !== allegato.nome)
        await dbLocale.bm.salva(scelto.immobile.id, a, {
          ...base,
          lettera: { ...base.lettera, allegati: [...altri, allegato] },
        })
      }
      registrati++
    }
    setStato('salvato')
    void dbLocale.documenti.pulisci()
    toast.ok(`${registrati} ${registrati === 1 ? 'allegato registrato' : 'allegati registrati'}.`)
    const { data } = await dbLocale.bm.get(immobileId, anno)
    setCampi(data ? estraiCampi(data) : datiBMVuoti())
  }

  // la regione è quella salvata sull'immobile (modificabile dalla sua scheda)
  const regione = dati?.regione?.trim() || null
  const lettera = campi.lettera
  const giorniAllaScadenza = giorniAlla(campi.periodo_al)
  const inScadenza = giorniAllaScadenza !== null && giorniAllaScadenza <= 60
  // "in corso di validità": la scadenza non è ancora passata
  const letteraValida = Boolean(lettera) && (giorniAllaScadenza === null || giorniAllaScadenza >= 0)
  // se non c'è nessun dato, la pagina mostra solo il pulsante di caricamento
  const schedaVuota =
    !lettera && !campi.fornitore && !campi.nominativo && !campi.fabbisogno && !campi.call_off
  const totaleBimestri = campi.bimestri.reduce((s, b) => s + (b.importo ?? 0), 0)
  const reportConsegnati = campi.report.filter(Boolean).length
  const anniElenco = Array.from(new Set([ANNO_CORRENTE, ANNO_CORRENTE + 1, ANNO_CORRENTE - 1, ...anni])).sort(
    (a, b) => b - a,
  )

  if (!immobile) return <Navigate to="/immobili" replace />

  return (
    <div className="space-y-6">
      {/* ---------- intestazione ---------- */}
      <section className="rounded-2xl border border-cielo-200 bg-cielo-50 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-cielo-800">
            Building Manager: <span className="text-cielo-600">{dati?.denominazione ?? immobile.denominazione}</span>
          </h1>
          <span className="rounded-full border border-cielo-300 bg-panna px-2.5 py-1 font-mono text-xs text-cielo-700">
            Asset {dati?.asset ?? immobile.asset}
          </span>
          {regione && (
            <span
              className="rounded-full border border-cielo-300 bg-panna px-2.5 py-1 text-xs text-cielo-700"
              title="Regione dedotta dalla localizzazione dell'immobile"
            >
              {regione}
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            <SpiaSalvataggio stato={stato} />
            <label className="flex items-center gap-2 text-sm text-cielo-700">
              Anno
              <select
                value={anno}
                onChange={(e) => setAnno(Number(e.target.value))}
                className="rounded-lg border border-cielo-300 bg-white px-2 py-1 text-sm text-cielo-800 outline-none focus:border-cielo-400"
              >
                {anniElenco.map((a) => (
                  <option key={a} value={a}>
                    {a}
                    {anni.includes(a) ? ' ●' : ''}
                  </option>
                ))}
              </select>
            </label>
          </span>
        </div>
        {/* i dati dell'immobile, gli stessi della sua scheda */}
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DatoLettera etichetta="Asset" valore={dati?.asset ?? immobile.asset} />
          <DatoLettera etichetta="Denominazione" valore={dati?.denominazione ?? immobile.denominazione} />
          <DatoLettera etichetta="Portafoglio" valore={dati?.portafoglio ?? null} />
          <DatoLettera etichetta="Regione" valore={regione} />
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-cielo-500">Localizzazione</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-cielo-800">
              {dati?.localizzazione || '—'}
              {dati?.localizzazione && (
                <button
                  onClick={() => apriMappa(dati.localizzazione as string)}
                  title="Apri la mappa"
                  className="rounded-full border border-cielo-300 bg-panna px-2 py-0.5 text-xs text-cielo-600 transition hover:bg-cielo-100 hover:text-cielo-800"
                >
                  vedi sulla mappa
                </button>
              )}
              <Link
                to="/immobile"
                className="text-xs text-cielo-500 underline transition hover:text-cielo-700"
              >
                apri la scheda
              </Link>
            </dd>
          </div>
        </dl>
        {errore && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errore}</p>}
      </section>

      {immobileSparito ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Questo immobile non risulta più nell'archivio (di solito succede dopo un'importazione).{' '}
          <Link to="/immobili" className="underline hover:text-amber-900">
            Riselezionalo dall'elenco
          </Link>{' '}
          per vedere il suo incarico.
        </p>
      ) : caricamento ? (
        <p className="text-sm text-cielo-500">Caricamento…</p>
      ) : schedaVuota ? (
        /* nessuna lettera e nessun dato: si parte da qui */
        <section className="rounded-2xl border border-cielo-200 bg-panna p-10 text-center">
          <p className="text-4xl">📄</p>
          <h2 className="mt-3 text-lg font-semibold text-cielo-800">
            Nessuna Lettera di attivazione in corso di validità
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-cielo-600">
            I dati dell'incarico di Building Management si ricavano dalla Lettera di attivazione: caricala e il
            programma ne legge fornitore, accordo quadro, nominativo del Building Manager, importo e durata.
          </p>
          <button
            onClick={() => setCaricaLettera(true)}
            className="mt-5 rounded-lg bg-cielo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-cielo-600"
          >
            Carica Lettera di Attivazione
          </button>
        </section>
      ) : (
        <>
          {/* ---------- lettera di attivazione ---------- */}
          <section
            className={`rounded-2xl border p-6 ${
              letteraValida ? 'border-cielo-200 bg-panna' : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">
                Lettera di attivazione
              </h2>
              <button
                onClick={() => setCaricaLettera(true)}
                className="rounded-lg border border-cielo-300 px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
              >
                {lettera ? 'Carica una nuova lettera' : 'Carica Lettera di Attivazione'}
              </button>
            </div>

            {lettera ? (
              <>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DatoLettera etichetta="Fornitore" valore={campi.fornitore} sotto={lettera.fornitoreIndirizzo} />
                  <DatoLettera
                    etichetta="Accordo quadro"
                    valore={lettera.accordoNome}
                    sotto={lettera.accordoData ? `del ${italiana(lettera.accordoData)}` : null}
                  />
                  <DatoLettera
                    etichetta="Building Manager"
                    valore={campi.nominativo}
                    sotto={lettera.codiceFiscaleBM}
                  />
                  <DatoLettera
                    etichetta="Importo prestazione"
                    valore={lettera.importo === null ? null : euro(lettera.importo)}
                  />
                  <DatoLettera
                    etichetta="Durata"
                    valore={
                      campi.periodo_dal && campi.periodo_al
                        ? `dal ${italiana(campi.periodo_dal)} al ${italiana(campi.periodo_al)}`
                        : null
                    }
                  />
                </dl>
                {/* il documento si riapre in una finestra dentro il programma */}
                <div className="mt-5 border-t border-cielo-200 pt-4">
                  <p className="text-base font-semibold text-cielo-800">
                    Lettera valida per {lettera.compendi.length}{' '}
                    {lettera.compendi.length === 1 ? 'compendio' : 'compendi'}
                  </p>
                  {lettera.documentoId ? (
                    <button
                      onClick={() => setDocumentoAperto(lettera.documentoId)}
                      title="Apri il documento in una finestra"
                      className="mt-1 flex items-center gap-1.5 text-sm text-cielo-600 underline transition hover:text-cielo-800"
                    >
                      📄 {lettera.nomeFile}
                    </button>
                  ) : (
                    <p className="mt-1 text-sm text-cielo-500">
                      {lettera.nomeFile}{' '}
                      <span className="text-xs">(caricata prima che i documenti venissero conservati)</span>
                    </p>
                  )}
                  {lettera.caricataIl && (
                    <p className="text-xs text-cielo-400">
                      caricata il {new Date(lettera.caricataIl).toLocaleDateString('it-IT')}
                    </p>
                  )}

                  <button
                    onClick={() => setCaricaAllegati(true)}
                    className="mt-3 rounded-lg border border-cielo-300 px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
                  >
                    Carica Allegati della lettera
                  </button>

                  {lettera.allegati.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {lettera.allegati.map((a) => (
                        <li key={a.documentoId} className="flex flex-wrap items-center gap-2 text-sm">
                          <button
                            onClick={() => setDocumentoAperto(a.documentoId)}
                            className="text-cielo-600 underline transition hover:text-cielo-800"
                          >
                            📎 {a.nome}
                          </button>
                          {a.classe && (
                            <span className="rounded-full bg-cielo-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cielo-600">
                              classe {a.classe}
                            </span>
                          )}
                          {a.importoTotale !== null && (
                            <span className="text-xs text-cielo-500">{euro(a.importoTotale)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {!letteraValida && (
                  <p className="mt-3 rounded-lg border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900">
                    ⚠️ Questa lettera è <b>scaduta</b> il {italiana(campi.periodo_al)}: carica quella nuova.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-amber-800">
                Per questo immobile non è stata caricata nessuna lettera: i dati qui sotto arrivano dal
                monitoraggio.
              </p>
            )}
          </section>

          {/* ---------- incarico ---------- */}
          <section className="rounded-2xl border border-cielo-200 bg-panna p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">Incarico {anno}</h2>
              <Scadenza giorni={giorniAllaScadenza} scadenza={campi.periodo_al} />
            </div>
            {inScadenza && giorniAllaScadenza !== null && giorniAllaScadenza >= 0 && (
              <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
                <IconaCampanella />
                Attenzione, incarico in scadenza tra {giorniAllaScadenza}{' '}
                {giorniAllaScadenza === 1 ? 'giorno' : 'giorni'} ({italiana(campi.periodo_al)}).
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo
                etichetta="Fornitore"
                valore={campi.fornitore}
                onCambia={(v) => modifica({ fornitore: v })}
                suggerimenti="fornitori-bm"
              />
              <Campo
                etichetta="Nominativo BM"
                valore={campi.nominativo}
                onCambia={(v) => modifica({ nominativo: v })}
              />
              <Campo etichetta="Recapito" valore={campi.recapito} onCambia={(v) => modifica({ recapito: v })} />
              <Scelta
                etichetta="Categoria"
                valore={campi.categoria}
                opzioni={['A', 'B', 'C']}
                onCambia={(v) => modifica({ categoria: v })}
              />
              <Campo
                etichetta="Incarico dal"
                tipo="date"
                valore={campi.periodo_dal}
                onCambia={(v) => modifica({ periodo_dal: v })}
              />
              <Campo
                etichetta="Incarico al"
                tipo="date"
                valore={campi.periodo_al}
                onCambia={(v) => modifica({ periodo_al: v })}
              />
            </div>
          </section>

          {/* ---------- report mensili ---------- */}
          <section className="rounded-2xl border border-cielo-200 bg-panna p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">
                Consegna report mensile
              </h2>
              <span className="text-xs text-cielo-500">{reportConsegnati} su 12 consegnati</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {MESI_BREVI.map((mese, i) => {
                const consegnato = campi.report[i]
                return (
                  <button
                    key={mese}
                    onClick={() =>
                      modifica({ report: campi.report.map((v, j) => (j === i ? !v : v)) })
                    }
                    title={consegnato ? `${mese}: consegnato` : `${mese}: da consegnare`}
                    className={`h-12 w-16 rounded-lg border text-sm font-medium transition ${
                      consegnato
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-cielo-200 bg-white text-cielo-500 hover:border-cielo-400'
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-wide">{mese}</span>
                    <span className="block text-base leading-none">{consegnato ? '✓' : '—'}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <p className="text-xs text-cielo-500">
            Le modifiche si salvano da sole.{' '}
            <Link to="/immobile" className="underline hover:text-cielo-700">
              Torna alla scheda dell'immobile
            </Link>
          </p>
        </>
      )}

      {/* suggerimenti: restano scrivibili a mano, non sono un elenco chiuso */}
      <datalist id="stati-autorizzazione">
        {STATI_AUTORIZZAZIONE.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <ElencoFornitori />

      {caricaLettera && (
        <CaricaLettera
          immobili={immobili}
          immobileCorrente={dati}
          onAnnulla={() => setCaricaLettera(false)}
          onFatto={(esito) => void registraLettera(esito)}
        />
      )}

      {caricaAllegati && (
        <CaricaAllegati
          immobili={immobili}
          atteso={{
            fornitore: campi.fornitore,
            dal: campi.periodo_dal,
            al: campi.periodo_al,
            categoria: campi.categoria,
          }}
          onAnnulla={() => setCaricaAllegati(false)}
          onFatto={(scelti) => void registraAllegati(scelti)}
        />
      )}

      {documentoAperto && (
        <FinestraDocumento id={documentoAperto} onChiudi={() => setDocumentoAperto(null)} />
      )}
    </div>
  )
}

/** Il file caricato, pronto per essere conservato nell'archivio. */
async function base64Di(file: File): Promise<string> {
  const byte = new Uint8Array(await file.arrayBuffer())
  let testo = ''
  // a pezzi: con i file grandi la conversione in un colpo solo va in errore
  const passo = 0x8000
  for (let i = 0; i < byte.length; i += passo) {
    testo += String.fromCharCode(...byte.subarray(i, i + passo))
  }
  return btoa(testo)
}

/** Giorni che mancano alla scadenza dell'incarico, accanto al titolo. */
function Scadenza({ giorni, scadenza }: { giorni: number | null; scadenza: string | null }) {
  if (giorni === null || !scadenza) return null
  if (giorni < 0) {
    return (
      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
        scaduto da {-giorni} {(-giorni) === 1 ? 'giorno' : 'giorni'} ({italiana(scadenza)})
      </span>
    )
  }
  const stile =
    giorni <= 60 ? 'bg-amber-50 text-amber-800' : giorni <= 180 ? 'bg-cielo-100 text-cielo-700' : 'bg-emerald-50 text-emerald-700'
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${stile}`}>
      {giorni === 0 ? 'scade oggi' : `mancano ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} alla scadenza`} (
      {italiana(scadenza)})
    </span>
  )
}

function IconaCampanella() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function DatoLettera({ etichetta, valore, sotto }: { etichetta: string; valore: string | null; sotto?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</dt>
      <dd className={`mt-0.5 text-sm ${valore ? 'text-cielo-800' : 'text-cielo-400'}`}>
        {valore || '—'}
        {sotto && <span className="block text-xs text-cielo-500">{sotto}</span>}
      </dd>
    </div>
  )
}

const inputCella =
  'w-full rounded border border-cielo-300 bg-white px-2 py-1 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-1 focus:ring-cielo-200'

function euro(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
}

/** I campi salvati, senza identità e senza data di aggiornamento. */
function estraiCampi(r: {
  lettera?: LetteraBM | null
  fornitore: string | null
  nominativo: string | null
  recapito: string | null
  categoria: string | null
  periodo_dal: string | null
  periodo_al: string | null
  fabbisogno: number | null
  call_off: string | null
  report: boolean[]
  bimestri: BimestreBM[]
  sds1: string | null
  sds2: string | null
  svincolo_id: string | null
  svincolo_aut: string | null
  note: string | null
}): DatiBM {
  const vuoto = datiBMVuoti()
  return {
    lettera: r.lettera ?? null,
    fornitore: r.fornitore,
    nominativo: r.nominativo,
    recapito: r.recapito,
    categoria: r.categoria,
    periodo_dal: r.periodo_dal,
    periodo_al: r.periodo_al,
    fabbisogno: r.fabbisogno,
    call_off: r.call_off,
    report: Array.from({ length: 12 }, (_, i) => Boolean(r.report?.[i])),
    bimestri: vuoto.bimestri.map((b, i) => ({ ...b, ...(r.bimestri?.[i] ?? {}) })),
    sds1: r.sds1,
    sds2: r.sds2,
    svincolo_id: r.svincolo_id,
    svincolo_aut: r.svincolo_aut,
    note: r.note,
  }
}

/** Suggerimenti per il fornitore: i nomi già usati negli altri immobili. */
function ElencoFornitori() {
  const [nomi, setNomi] = useState<string[]>([])

  useEffect(() => {
    let vivo = true
    void dbLocale.bm.fornitori().then(({ data }) => {
      if (vivo) setNomi(data ?? [])
    })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <datalist id="fornitori-bm">
      {nomi.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  )
}

/**
 * Autorizzazione alla fatturazione: si scrive quel che serve. "ok" e "inviare"
 * sono lì come suggerimento e si colorano da soli; qualsiasi altro testo
 * (compreso un importo) è ammesso.
 */
function SceltaAutorizzazione({
  valore,
  onCambia,
  grande,
}: {
  valore: string | null
  onCambia: (v: string | null) => void
  grande?: boolean
}) {
  const attuale = valore ?? ''
  const normale = attuale.trim().toLowerCase()
  const colore =
    normale === 'ok'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
      : normale === 'inviare'
        ? 'border-amber-300 bg-amber-50 text-amber-800'
        : 'border-cielo-300 bg-white text-cielo-800'

  return (
    <input
      list="stati-autorizzazione"
      value={attuale}
      onChange={(e) => onCambia(e.target.value || null)}
      placeholder="ok, inviare, …"
      className={`w-full rounded border px-2 text-sm outline-none transition focus:border-cielo-400 focus:ring-1 focus:ring-cielo-200 ${colore} ${
        grande ? 'rounded-lg py-1.5' : 'py-1'
      }`}
    />
  )
}

function SpiaSalvataggio({ stato }: { stato: Salvataggio }) {
  if (stato === 'fermo') return null
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        stato === 'in-corso' ? 'bg-cielo-100 text-cielo-600' : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      {stato === 'in-corso' ? 'salvataggio…' : 'salvato ✓'}
    </span>
  )
}

function Campo({
  etichetta,
  valore,
  onCambia,
  tipo = 'text',
  mono,
  suffisso,
  suggerimenti,
}: {
  etichetta: string
  valore: string | null
  onCambia: (v: string | null) => void
  tipo?: 'text' | 'date' | 'number'
  mono?: boolean
  suffisso?: string
  suggerimenti?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <input
          type={tipo}
          list={suggerimenti}
          value={valore ?? ''}
          onChange={(e) => onCambia(e.target.value === '' ? null : e.target.value)}
          className={`w-full rounded-lg border border-cielo-300 bg-white px-3 py-1.5 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100 ${
            mono ? 'font-mono' : ''
          }`}
        />
        {suffisso && <span className="shrink-0 text-sm text-cielo-500">{suffisso}</span>}
      </span>
    </label>
  )
}

function Scelta({
  etichetta,
  valore,
  opzioni,
  onCambia,
}: {
  etichetta: string
  valore: string | null
  opzioni: string[]
  onCambia: (v: string | null) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</span>
      <select
        value={valore ?? ''}
        onChange={(e) => onCambia(e.target.value === '' ? null : e.target.value)}
        className="mt-1 w-full rounded-lg border border-cielo-300 bg-white px-3 py-1.5 text-sm text-cielo-800 outline-none transition focus:border-cielo-400 focus:ring-2 focus:ring-cielo-100"
      >
        <option value="">—</option>
        {opzioni.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
