import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { dbLocale } from '../lib/db'
import { useSelezione } from '../hooks/useSelezione'
import { useToast } from '../hooks/useToast'
import { useImmobili } from '../hooks/useImmobili'
import { useMappa } from '../hooks/useMappa'
import {
  BIMESTRI,
  MESI,
  MESI_BREVI,
  STATI_AUTORIZZAZIONE,
  datiBMVuoti,
  mesiPerEsteso,
  reportAttesiPerClasse,
} from '../lib/tipi'
import type { BimestreBM, DatiBM, Immobile, LetteraBM, AllegatoBM, CertificatoBM } from '../lib/tipi'
import { giorniAlla, mesiDiIncarico } from '../lib/letteraAttivazione'
import CaricaLettera, { italiana } from '../components/CaricaLettera'
import type { EsitoLettera } from '../components/CaricaLettera'
import CaricaAllegati from '../components/CaricaAllegati'
import type { FileAnalizzato } from '../components/CaricaAllegati'
import FinestraDocumento from '../components/FinestraDocumento'
import ConfermaCodice from '../components/ConfermaCodice'
import Conferma from '../components/Conferma'
import GeneraCertificato from '../components/GeneraCertificato'
import { pdfDaRighe } from '../lib/pdfSemplice'
import { nomeUnivoco } from '../lib/nomiFile'
import { regioneDaLocalizzazione } from '../lib/regioni'

type Salvataggio = 'fermo' | 'in-corso' | 'salvato'

const ANNO_CORRENTE = new Date().getFullYear()

export default function BuildingManagerPage() {
  const { immobile } = useSelezione()
  const { immobili, caricamento: caricamentoImmobili, ricarica: ricaricaImmobili } = useImmobili()
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
  const [confermaCancellaLettera, setConfermaCancellaLettera] = useState(false)
  const [allegatoDaCancellare, setAllegatoDaCancellare] = useState<AllegatoBM | null>(null)
  const [generaCertificato, setGeneraCertificato] = useState(false)
  const [certificatoDaCancellare, setCertificatoDaCancellare] = useState<CertificatoBM | null>(null)
  // ordine dell'elenco dei certificati: si cambia dalle intestazioni
  const [ordineCertificati, setOrdineCertificati] = useState<{
    colonna: ColonnaCertificati
    crescente: boolean
  }>({ colonna: 'data', crescente: false })

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

  /** Clic sull'ennesima casella del mese: consegnati = n+1, oppure n se già segnata. */
  function segnaReport(mese: number, casella: number) {
    const fatti = campi.report[mese] ?? 0
    const nuovo = fatti > casella ? casella : casella + 1
    // un mese certificato non si può ridurre: il certificato dice che i report
    // sono arrivati. Per rimetterci mano bisogna prima cancellare il certificato
    if (nuovo < fatti && mesiCertificati.has(mese + 1)) {
      toast.errore(
        `${MESI[mese]} ha già un Certificato di Avvenuta Prestazione: i report consegnati non si possono togliere. Cancella prima il certificato.`,
      )
      return
    }
    modifica({ report: campi.report.map((v, i) => (i === mese ? nuovo : v)) })
  }

  /** Clic sull'intestazione: prima volta ordina, le successive girano il verso. */
  function ordinaCertificatiPer(colonna: ColonnaCertificati) {
    setOrdineCertificati((o) =>
      o.colonna === colonna
        ? { colonna, crescente: !o.crescente }
        : // le date partono dalla più recente, il resto dall'inizio
          { colonna, crescente: colonna !== 'data' },
    )
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
        // se una lettera c'era già, quel che è stato tracciato resta; se invece
        // la scheda veniva dal vecchio monitoraggio si riparte puliti
        const base = esistente?.lettera ? estraiCampi(esistente) : datiBMVuoti()
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

    // prima le correzioni ai portafogli accettate durante il controllo
    for (const scelto of scelti) {
      const c = scelto.correzione
      if (!c || !scelto.immobile) continue
      const bersagli =
        c.ambito === 'tutti'
          ? immobili.filter((i) => (i.portafoglio ?? '').trim() === c.da.trim())
          : [scelto.immobile]
      for (const im of bersagli) {
        await dbLocale.immobili.update(im.id, {
          asset: im.asset,
          denominazione: im.denominazione,
          portafoglio: c.a,
          localizzazione: im.localizzazione,
          regione: im.regione,
        })
      }
      await ricaricaImmobili()
      toast.ok(
        `Portafoglio «${c.da}» rinominato in «${c.a}» su ${bersagli.length} ${
          bersagli.length === 1 ? 'immobile' : 'immobili'
        }.`,
      )
    }

    let registrati = 0
    // per il messaggio finale: dove è finito ogni allegato
    const riepilogo: { nome: string; id: string; asset: string; denominazione: string; anni: number[] }[] = []
    for (const scelto of scelti) {
      if (!scelto.immobile) continue
      // gli anni sono quelli della lettera DI QUELL'IMMOBILE: l'allegato vive
      // insieme alla sua lettera, non a quella della pagina che sto guardando
      const annoScheda = Number((scelto.scheda?.dal ?? '').slice(0, 4)) || anno
      const { data: riferimento } = await dbLocale.bm.get(scelto.immobile.id, annoScheda)
      if (!riferimento?.lettera) {
        toast.errore(`"${scelto.file.name}": ${scelto.immobile.denominazione} non ha una lettera per il ${annoScheda}.`)
        continue
      }
      const primo = Number((riferimento.periodo_dal ?? '').slice(0, 4)) || annoScheda
      const ultimo = Number((riferimento.periodo_al ?? '').slice(0, 4)) || primo
      const anni: number[] = []
      for (let a = primo; a <= Math.min(ultimo, primo + 9); a++) anni.push(a)

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
      riepilogo.push({
        nome: scelto.file.name,
        id: scelto.immobile.id,
        asset: scelto.immobile.asset,
        denominazione: scelto.immobile.denominazione,
        anni,
      })
    }
    setStato('salvato')
    void dbLocale.documenti.pulisci()
    // si dice sempre SU QUALE immobile sono finiti: la scheda intervento può
    // riguardare un compendio diverso da quello aperto in questo momento
    if (registrati > 0) {
      const dettaglio = riepilogo
        .map((r) => `${r.nome} → ${r.asset} ${r.denominazione} (${r.anni.join(', ')})`)
        .join(' · ')
      toast.ok(
        `${registrati} ${registrati === 1 ? 'allegato registrato' : 'allegati registrati'}: ${dettaglio}`,
      )
      const altrove = riepilogo.filter((r) => r.id !== immobileId)
      if (altrove.length > 0) {
        toast.avviso(
          `${altrove.length === 1 ? 'Un allegato riguarda' : `${altrove.length} allegati riguardano`} ` +
            `${altrove.map((r) => r.denominazione).join(', ')}: per vederli apri quell'immobile.`,
        )
      }
    }
    const { data } = await dbLocale.bm.get(immobileId, anno)
    setCampi(data ? estraiCampi(data) : datiBMVuoti())
  }

  /**
   * Cancella la lettera dovunque sia stata registrata: la stessa lettera vale
   * per più compendi, quindi se ne va da tutti gli immobili e da tutti gli anni,
   * allegati compresi.
   */
  async function cancellaLettera() {
    const daTogliere = campi.lettera
    if (!daTogliere) return
    setConfermaCancellaLettera(false)
    setStato('in-corso')
    const { data: incarichi } = await dbLocale.bm.tutti()
    const coinvolti = (incarichi ?? []).filter((i) => stessaLettera(i.lettera, daTogliere))
    // la scheda se ne va tutta: senza lettera non resta niente di valido, e i
    // conteggi dei report non devono ricomparire alla prossima lettera
    for (const i of coinvolti) {
      await dbLocale.bm.rimuovi(i.immobile_id, i.anno)
    }
    // i file (lettera e allegati) se ne vanno davvero dall'archivio, non solo
    // il loro riferimento: si aspetta la pulizia prima di dire che è fatta
    const { data: fileTolti } = await dbLocale.documenti.pulisci()
    setStato('fermo')
    const quantiImmobili = new Set(coinvolti.map((i) => i.immobile_id)).size
    toast.ok(
      `Lettera «${daTogliere.nomeFile}» cancellata da ${quantiImmobili} ${
        quantiImmobili === 1 ? 'immobile' : 'immobili'
      } (${coinvolti.length} schede), allegati compresi` +
        (fileTolti ? `. Eliminati ${fileTolti} ${fileTolti === 1 ? 'file' : 'file'} dall'archivio.` : '.'),
    )
    const { data } = await dbLocale.bm.get(immobileId, anno)
    setCampi(data ? estraiCampi(data) : datiBMVuoti())
  }

  /**
   * Aggancia il file a una lettera registrata quando il documento non era stato
   * conservato (le prime versioni salvavano solo i dati letti). Il file viene
   * collegato dovunque quella lettera sia stata registrata.
   */
  async function agganciaFileLettera(file: File) {
    const attuale = campi.lettera
    if (!attuale) return
    setStato('in-corso')
    const { data: documentoId, error } = await dbLocale.documenti.salva({
      nome: file.name,
      tipo: file.type || 'application/pdf',
      dimensione: file.size,
      contenuto: await base64Di(file),
    })
    if (error || !documentoId) {
      setStato('fermo')
      toast.errore(`File non salvato: ${error?.message ?? 'errore'}`)
      return
    }
    const { data: incarichi } = await dbLocale.bm.tutti()
    const coinvolti = (incarichi ?? []).filter((i) => stessaLettera(i.lettera, attuale))
    for (const i of coinvolti) {
      const base = estraiCampi(i)
      if (!base.lettera) continue
      await dbLocale.bm.salva(i.immobile_id, i.anno, {
        ...base,
        lettera: { ...base.lettera, nomeFile: file.name, documentoId },
      })
    }
    void dbLocale.documenti.pulisci()
    setStato('salvato')
    toast.ok(`«${file.name}» collegato alla lettera: ora si apre da qui.`)
    const { data } = await dbLocale.bm.get(immobileId, anno)
    setCampi(data ? estraiCampi(data) : datiBMVuoti())
  }

  /**
   * Genera il Certificato di Avvenuta Prestazione per i mesi scelti. Per ora il
   * documento è di prova: contiene i dati dell'incarico e i mesi certificati.
   */
  async function creaCertificato(mesi: number[]) {
    if (mesi.length === 0) return
    setGeneraCertificato(false)
    setStato('in-corso')
    const elenco = mesiPerEsteso(mesi)
    const oggi = new Date()
    const pdf = pdfDaRighe('Certificato di Avvenuta Prestazione', [
      { testo: '(documento di prova)', spazioPrima: 4 },
      { testo: `Immobile: ${dati?.asset ?? ''} ${dati?.denominazione ?? ''}`, grande: true, spazioPrima: 14 },
      { testo: `Localizzazione: ${dati?.localizzazione ?? '-'}` },
      { testo: `Portafoglio: ${dati?.portafoglio ?? '-'}` },
      { testo: `Fornitore: ${campi.fornitore ?? '-'}`, spazioPrima: 12 },
      { testo: `Building Manager: ${campi.nominativo ?? '-'}` },
      { testo: `Incarico: dal ${italiana(campi.periodo_dal)} al ${italiana(campi.periodo_al)}` },
      { testo: `Lettera di attivazione: ${campi.lettera?.nomeFile ?? '-'}` },
      { testo: `Accordo quadro: ${campi.lettera?.accordoNome ?? '-'}` },
      { testo: `Periodo certificato: ${elenco} ${anno}`, grande: true, grassetto: true, spazioPrima: 16 },
      {
        testo: `Report consegnati: ${mesi.length * attesiAlMese} (${attesiAlMese} al mese, classe ${
          classeImmobile ?? '-'
        })`,
      },
      { testo: `Generato il ${oggi.toLocaleDateString('it-IT')} alle ${oggi.toLocaleTimeString('it-IT')}`, spazioPrima: 20 },
    ])

    const nomeVisibile = `Certificato ${elenco} ${anno} - ${dati?.denominazione ?? ''}.pdf`
    const { data: documentoId, error } = await dbLocale.documenti.salva({
      nome: nomeVisibile,
      // sul disco il nome non si ripete mai: così due certificati non si pestano
      nomeArchivio: nomeUnivoco(nomeVisibile),
      tipo: 'application/pdf',
      dimensione: pdf.size,
      contenuto: await base64Di(new File([pdf], nomeVisibile)),
    })
    if (error || !documentoId) {
      setStato('fermo')
      toast.errore(`Certificato non salvato: ${error?.message ?? 'errore'}`)
      return
    }
    const certificato: CertificatoBM = {
      id: crypto.randomUUID(),
      documentoId,
      nome: nomeVisibile,
      generatoIl: new Date().toISOString(),
      mesi,
    }
    const aggiornati = [...certificati, certificato]
    const { error: erroreSalva } = await dbLocale.bm.salva(immobileId, anno, {
      ...campi,
      certificati: aggiornati,
    })
    setStato('fermo')
    if (erroreSalva) {
      toast.errore(`Certificato non registrato: ${erroreSalva.message}`)
      return
    }
    setCampi((c) => ({ ...c, certificati: aggiornati }))
    toast.ok(`Certificato generato per ${elenco} ${anno}.`)
  }

  /** Cancella un certificato: se ne va anche il PDF dall'archivio. */
  async function cancellaCertificato(cert: CertificatoBM) {
    setCertificatoDaCancellare(null)
    setStato('in-corso')
    const rimasti = certificati.filter((c) => c.id !== cert.id)
    const { error } = await dbLocale.bm.salva(immobileId, anno, { ...campi, certificati: rimasti })
    if (error) {
      setStato('fermo')
      toast.errore(`Certificato non cancellato: ${error.message}`)
      return
    }
    setCampi((c) => ({ ...c, certificati: rimasti }))
    const { data: fileTolti } = await dbLocale.documenti.pulisci()
    setStato('fermo')
    toast.ok(
      `Certificato di ${mesiPerEsteso(cert.mesi)} ${anno} cancellato` +
        (fileTolti ? ", e il file è stato eliminato dall'archivio." : '.'),
    )
  }

  /** Cancella un allegato: solo per questo immobile, su tutti gli anni della lettera. */
  async function cancellaAllegato(allegato: AllegatoBM) {
    setAllegatoDaCancellare(null)
    setStato('in-corso')
    const primo = Number((campi.periodo_dal ?? '').slice(0, 4)) || anno
    const ultimo = Number((campi.periodo_al ?? '').slice(0, 4)) || primo
    for (let a = primo; a <= Math.min(ultimo, primo + 9); a++) {
      const { data: esistente } = await dbLocale.bm.get(immobileId, a)
      if (!esistente?.lettera) continue
      const base = estraiCampi(esistente)
      if (!base.lettera) continue
      await dbLocale.bm.salva(immobileId, a, {
        ...base,
        lettera: {
          ...base.lettera,
          allegati: base.lettera.allegati.filter((x) => x.documentoId !== allegato.documentoId),
        },
      })
    }
    const { data: fileTolti } = await dbLocale.documenti.pulisci()
    setStato('fermo')
    toast.ok(
      `Allegato «${allegato.nome}» cancellato da ${dati?.denominazione ?? 'questo immobile'}` +
        (fileTolti
          ? ", e il file è stato eliminato dall'archivio."
          : '. Il file resta perché serve ad altri immobili.'),
    )
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
  const totaleBimestri = campi.bimestri.reduce((s, b) => s + (b.importo ?? 0), 0)
  // la classe arriva dalla scheda intervento; se manca, la sezione dei report
  // non ha senso perché non si sa quanti chiederne
  const classeImmobile = lettera?.allegati.find((a) => a.classe)?.classe ?? null
  const attesiAlMese = campi.reportAttesi ?? reportAttesiPerClasse(classeImmobile)
  const certificati = campi.certificati ?? []
  // i mesi già finiti in un certificato: si riconoscono dalla pergamena
  const mesiCertificati = new Set(certificati.flatMap((c) => c.mesi))
  const certificatiInOrdine = [...certificati].sort((a, b) => {
    const verso = ordineCertificati.crescente ? 1 : -1
    if (ordineCertificati.colonna === 'data')
      return verso * (Date.parse(a.generatoIl) - Date.parse(b.generatoIl))
    if (ordineCertificati.colonna === 'mesi')
      return verso * (Math.min(...a.mesi) - Math.min(...b.mesi))
    return verso * a.nome.localeCompare(b.nome, 'it')
  })
  const reportConsegnati = campi.report.reduce((s, n) => s + Math.min(n ?? 0, attesiAlMese), 0)
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
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-cielo-500 transition hover:bg-cielo-100 hover:text-cielo-700"
                >
                  <IconaMappamondo />
                </button>
              )}
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
      ) : !lettera ? (
        /* senza lettera per quest'anno non c'è incarico da mostrare */
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">
              Lettera di attivazione
            </h2>
            <button
              onClick={() => setCaricaLettera(true)}
              className="rounded-lg border border-cielo-300 bg-panna px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
            >
              Carica Lettera di Attivazione
            </button>
          </div>
          <p className="mt-3 text-sm text-amber-800">
            Per questo immobile non è stata caricata nessuna lettera per il {anno}: caricato il documento si
            visualizzeranno i dati.
          </p>
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
              <Scadenza giorni={giorniAllaScadenza} scadenza={campi.periodo_al} />

            </div>

            {lettera && (
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
                    valore={durataPerEsteso(campi.periodo_dal, campi.periodo_al)}
                  />
                </dl>
                {/* il documento si riapre in una finestra dentro il programma */}
                <div className="mt-5 border-t border-cielo-200 pt-4">
                  <p className="text-base font-semibold text-cielo-800">
                    Lettera valida per {lettera.compendi.length}{' '}
                    {lettera.compendi.length === 1 ? 'compendio' : 'compendi'}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {lettera.documentoId ? (
                      <button
                        onClick={() => setDocumentoAperto(lettera.documentoId)}
                        title="Apri il documento in una finestra"
                        className="flex items-center gap-1.5 text-sm text-cielo-600 underline transition hover:text-cielo-800"
                      >
                        📄 {lettera.nomeFile}
                      </button>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2 text-sm text-cielo-500">
                        📄 {lettera.nomeFile}
                        <label className="cursor-pointer rounded-lg border border-cielo-300 px-2 py-1 text-xs text-cielo-700 transition hover:bg-cielo-50">
                          Aggiungi il file per poterla aprire
                          <input
                            type="file"
                            accept="application/pdf,.pdf,.docx"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) void agganciaFileLettera(f)
                            }}
                          />
                        </label>
                      </span>
                    )}
                    <button
                      onClick={() => setConfermaCancellaLettera(true)}
                      title="Cancella la lettera e i suoi allegati"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-cielo-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <IconaCestino />
                    </button>
                  </div>
                  {lettera.caricataIl && (
                    <p className="text-xs text-cielo-400">
                      caricata il {new Date(lettera.caricataIl).toLocaleDateString('it-IT')}
                    </p>
                  )}

                </div>

                {/* ---- allegati di questa lettera, per QUESTO immobile ---- */}
                <div className="mt-5 border-t border-cielo-200 pt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-base font-semibold text-cielo-800">
                      Allegati caricati
                      {lettera.allegati.length > 0 && (
                        <span className="ml-2 text-sm font-normal text-cielo-500">
                          ({lettera.allegati.length}) per {dati?.denominazione ?? "questo immobile"}
                        </span>
                      )}
                    </p>
                    <button
                      onClick={() => setCaricaAllegati(true)}
                      className="rounded-lg border border-cielo-300 px-3 py-1.5 text-sm text-cielo-700 transition hover:bg-cielo-50"
                    >
                      Carica Allegati della lettera
                    </button>
                  </div>

                  {lettera.allegati.length === 0 ? (
                    <p className="mt-2 text-sm text-cielo-500">
                      Nessun allegato caricato per questo immobile. Ogni scheda intervento riguarda un solo
                      immobile: gli allegati degli altri compendi della lettera si vedono aprendo quegli
                      immobili.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-cielo-100 rounded-xl border border-cielo-200 bg-panna">
                      {lettera.allegati.map((a) => (
                        <li key={a.documentoId} className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <button
                              onClick={() => setDocumentoAperto(a.documentoId)}
                              title="Apri l'allegato in una finestra"
                              className="min-w-0 flex-1 truncate text-left text-cielo-600 underline transition hover:text-cielo-800"
                            >
                              📎 {a.nome}
                            </button>
                            <button
                              onClick={() => setAllegatoDaCancellare(a)}
                              title="Cancella questo allegato (solo per questo immobile)"
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-cielo-400 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <IconaCestino />
                            </button>
                          </div>
                          {/* quello che è stato letto dalla scheda intervento */}
                          <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                            <DatoAllegato etichetta="Sito" valore={[a.asset, a.sito].filter(Boolean).join(' · ')} />
                            <DatoAllegato etichetta="Lotto" valore={a.lotto} />
                            <DatoAllegato etichetta="Committente" valore={a.committente} />
                            <DatoAllegato etichetta="Classe" valore={a.classe} />
                            <DatoAllegato etichetta="Appaltatore" valore={a.appaltatore} />
                            <DatoAllegato
                              etichetta="Durata"
                              valore={durataPerEsteso(a.dal, a.al)}
                            />
                            <DatoAllegato
                              etichetta="Importo dell'intervento"
                              valore={a.importoTotale === null ? null : euro(a.importoTotale)}
                            />
                          </dl>
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
            )}
          </section>

          {/* ---------- report mensili: compaiono quando si conosce la classe ---------- */}
          {classeImmobile ? (
            <section className="rounded-2xl border border-cielo-200 bg-panna p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">
                  Consegna report mensile
                </h2>
                <span className="flex flex-wrap items-center gap-3 text-xs text-cielo-500">
                  <span>
                    Classe <b className="text-cielo-700">{classeImmobile}</b> · il fornitore consegna
                  </span>
                  <select
                    value={attesiAlMese}
                    onChange={(e) => modifica({ reportAttesi: Number(e.target.value) })}
                    title="Quanti report deve consegnare ogni mese"
                    className="rounded border border-cielo-300 bg-white px-2 py-0.5 text-xs text-cielo-800 outline-none focus:border-cielo-400"
                  >
                    <option value={1}>1 report al mese</option>
                    <option value={2}>2 report al mese</option>
                  </select>
                  <span>
                    <b className="text-cielo-700">{reportConsegnati}</b> su {attesiAlMese * 12} consegnati
                  </span>
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {MESI_BREVI.map((mese, i) => {
                  const fatti = campi.report[i] ?? 0
                  const completo = fatti >= attesiAlMese
                  const certificato = mesiCertificati.has(i + 1)
                  return (
                    <div
                      key={mese}
                      className={`relative w-16 rounded-lg border p-1.5 text-center transition ${
                        completo ? 'border-emerald-300 bg-emerald-50' : 'border-cielo-200 bg-white'
                      }`}
                    >
                      {/* la pergamena dice che il mese è già finito in un certificato */}
                      {certificato && (
                        <span
                          title={`${MESI[i]}: incluso in un Certificato di Avvenuta Prestazione`}
                          className="absolute -right-1 -top-1.5 text-[13px] leading-none drop-shadow-sm"
                        >
                          📜
                        </span>
                      )}
                      <span
                        className={`block text-xs font-semibold uppercase tracking-wide ${
                          completo ? 'text-emerald-800' : 'text-cielo-500'
                        }`}
                      >
                        {mese}
                      </span>
                      <span className="mt-1 flex justify-center gap-1">
                        {Array.from({ length: attesiAlMese }, (_, n) => {
                          // le caselle già segnate di un mese certificato sono ferme
                          const bloccata = certificato && fatti > n
                          return (
                            <button
                              key={n}
                              onClick={() => segnaReport(i, n)}
                              title={
                                bloccata
                                  ? `${MESI[i]}: certificato emesso, il report non si può togliere`
                                  : `${MESI[i]}: ${n + 1}° report ${fatti > n ? 'consegnato' : 'da consegnare'}`
                              }
                              className={`h-6 w-6 rounded border text-xs font-bold transition ${
                                fatti > n
                                  ? `border-emerald-400 bg-emerald-500 text-white ${
                                      bloccata ? 'cursor-not-allowed' : ''
                                    }`
                                  : 'border-cielo-300 bg-white text-cielo-300 hover:border-cielo-500'
                              }`}
                            >
                              {fatti > n ? '✓' : ''}
                            </button>
                          )
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* ---- certificati di avvenuta prestazione ---- */}
              <div className="mt-5 border-t border-cielo-200 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-base font-semibold text-cielo-800">
                    Certificati di Avvenuta Prestazione
                  </p>
                  <button
                    onClick={() => setGeneraCertificato(true)}
                    className="flex items-center gap-2 rounded-lg bg-cielo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cielo-600"
                  >
                    <IconaCertificato />
                    Genera Certificato
                  </button>
                </div>

                {certificati.length === 0 ? (
                  <p className="mt-2 text-sm text-cielo-500">
                    Nessun certificato generato per questo immobile.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-cielo-200 text-left text-xs uppercase tracking-wide text-cielo-500">
                          <ColonnaOrdinabile
                            titolo="Generato il"
                            colonna="data"
                            ordine={ordineCertificati}
                            onOrdina={ordinaCertificatiPer}
                          />
                          <ColonnaOrdinabile
                            titolo="Mesi certificati"
                            colonna="mesi"
                            ordine={ordineCertificati}
                            onOrdina={ordinaCertificatiPer}
                          />
                          <ColonnaOrdinabile
                            titolo="Documento"
                            colonna="nome"
                            ordine={ordineCertificati}
                            onOrdina={ordinaCertificatiPer}
                          />
                          <th className="w-8 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {certificatiInOrdine.map((c) => (
                          <tr
                            key={c.id}
                            className="group border-b border-cielo-100 transition hover:bg-cielo-100 last:border-0"
                          >
                            <td className="whitespace-nowrap px-2 py-2 text-cielo-700">
                              {dataEOra(c.generatoIl)}
                            </td>
                            <td className="px-2 py-2 text-cielo-700">{mesiPerEsteso(c.mesi)}</td>
                            <td className="px-2 py-2">
                              <button
                                onClick={() => setDocumentoAperto(c.documentoId)}
                                title="Apri il certificato"
                                className="text-left text-cielo-600 underline transition hover:text-cielo-800"
                              >
                                📄 {c.nome}
                              </button>
                            </td>
                            <td className="w-8 px-2 py-2 text-right">
                              <button
                                onClick={() => setCertificatoDaCancellare(c)}
                                title="Cancella questo certificato"
                                className="flex h-6 w-6 items-center justify-center rounded-full text-cielo-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                              >
                                <IconaCestino />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-cielo-200 bg-panna p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-cielo-500">
                Consegna report mensile
              </h2>
              <p className="mt-2 text-sm text-cielo-600">
                Quanti report al mese servono dipende dalla <b>classe dell'immobile</b>, che si legge dalla
                scheda intervento: carica un allegato e questa parte comparirà da sola.
              </p>
            </section>
          )}

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
          annoCorrente={anno}
          leggiIncarico={async (id, a) => {
            const { data } = await dbLocale.bm.get(id, a)
            if (!data?.lettera) return null
            return {
              fornitore: data.fornitore,
              dal: data.periodo_dal,
              al: data.periodo_al,
              categoria: data.categoria,
              accordoNome: data.lettera.accordoNome,
              nomeLettera: data.lettera.nomeFile,
              compendi: data.lettera.compendi ?? [],
            }
          }}
          onAnnulla={() => setCaricaAllegati(false)}
          onFatto={(scelti) => void registraAllegati(scelti)}
        />
      )}

      {documentoAperto && (
        <FinestraDocumento id={documentoAperto} onChiudi={() => setDocumentoAperto(null)} />
      )}

      {generaCertificato && (
        <GeneraCertificato
          anno={anno}
          denominazione={dati?.denominazione ?? immobile.denominazione}
          report={campi.report}
          attesiAlMese={attesiAlMese}
          certificati={certificati}
          onChiudi={() => setGeneraCertificato(false)}
          onContinua={(mesi) => void creaCertificato(mesi)}
        />
      )}

      {confermaCancellaLettera && campi.lettera && (
        <ConfermaCodice
          titolo="Cancellare la Lettera di attivazione?"
          azione="Cancella la lettera"
          onAnnulla={() => setConfermaCancellaLettera(false)}
          onConferma={() => void cancellaLettera()}
        >
          <p>
            Se ne va tutto quello che dipende dalla lettera <b>{campi.lettera.nomeFile}</b>: i dati
            dell'incarico, <b>tutti i suoi allegati</b> e la <b>traccia dei report consegnati</b>.
          </p>
          {campi.lettera.compendi.length > 1 ? (
            <p className="mt-2">
              Attenzione: questa lettera vale per <b>{campi.lettera.compendi.length} compendi</b>, quindi la
              cancellazione <b>non riguarda solo {dati?.denominazione ?? "questo immobile"}</b> ma tutti gli
              immobili su cui è stata registrata, per ogni anno dell'incarico.
            </p>
          ) : (
            <p className="mt-2">
              La cancellazione riguarda <b>{dati?.denominazione ?? "questo immobile"}</b>, per ogni anno
              dell'incarico.
            </p>
          )}
        </ConfermaCodice>
      )}

      {certificatoDaCancellare && (
        <Conferma
          titolo="Cancellare questo certificato?"
          azione="Cancella il certificato"
          onAnnulla={() => setCertificatoDaCancellare(null)}
          onConferma={() => void cancellaCertificato(certificatoDaCancellare)}
        >
          <p>
            Se ne vanno il certificato di <b>{mesiPerEsteso(certificatoDaCancellare.mesi)} {anno}</b> e il suo
            file PDF. I report consegnati restano segnati: dopo la cancellazione potrai generarne uno nuovo per
            quegli stessi mesi.
          </p>
        </Conferma>
      )}

      {allegatoDaCancellare && (
        <ConfermaCodice
          titolo="Cancellare questo allegato?"
          azione="Cancella l'allegato"
          onAnnulla={() => setAllegatoDaCancellare(null)}
          onConferma={() => void cancellaAllegato(allegatoDaCancellare)}
        >
          <p>
            Se ne va <b>{allegatoDaCancellare.nome}</b> soltanto da{' '}
            <b>{dati?.denominazione ?? "questo immobile"}</b>: sugli altri immobili della stessa lettera resta
            dov'è. La lettera non viene toccata.
          </p>
        </ConfermaCodice>
      )}
    </div>
  )
}

/** Due registrazioni parlano della stessa lettera? */
function stessaLettera(a: LetteraBM | null | undefined, b: LetteraBM): boolean {
  if (!a) return false
  if (a.documentoId && b.documentoId) return a.documentoId === b.documentoId
  // lettere caricate prima che i file venissero conservati: si confronta il resto
  return a.nomeFile === b.nomeFile && a.accordoNome === b.accordoNome
}

/** "dal 01/01/2025 al 31/12/2026 (24 mesi)" */
function durataPerEsteso(dal: string | null, al: string | null): string | null {
  if (!dal || !al) return null
  const mesi = mesiDiIncarico(dal, al)
  return `dal ${italiana(dal)} al ${italiana(al)}${mesi ? ` (${mesi} ${mesi === 1 ? 'mese' : 'mesi'})` : ''}`
}

/** Una riga dei dati letti dalla scheda intervento. */
function DatoAllegato({ etichetta, valore }: { etichetta: string; valore: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-semibold uppercase tracking-wide text-cielo-500">{etichetta}</dt>
      <dd className={`min-w-0 flex-1 truncate ${valore ? 'text-cielo-700' : 'text-cielo-400'}`} title={valore ?? ''}>
        {valore || '—'}
      </dd>
    </div>
  )
}

function IconaMappamondo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function IconaCertificato() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <path d="M8 7h7M8 11h5" />
      <circle cx="17.5" cy="15.5" r="3.5" />
      <path d="M15.5 18.5 15 22l2.5-1.4L20 22l-.5-3.5" />
    </svg>
  )
}

function IconaCestino() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

/** Per che cosa si può ordinare l'elenco dei certificati. */
type ColonnaCertificati = 'data' | 'mesi' | 'nome'

/** "05/08/2026 · 17:11": la data e l'ora in cui il certificato è nato. */
function dataEOra(quando: string): string {
  const d = new Date(quando)
  if (Number.isNaN(d.getTime())) return quando
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return `${d.toLocaleDateString('it-IT')} · ${ora}`
}

/** Intestazione che ordina l'elenco, con le due freccine del verso. */
function ColonnaOrdinabile({
  titolo,
  colonna,
  ordine,
  onOrdina,
}: {
  titolo: string
  colonna: ColonnaCertificati
  ordine: { colonna: ColonnaCertificati; crescente: boolean }
  onOrdina: (colonna: ColonnaCertificati) => void
}) {
  const attiva = ordine.colonna === colonna
  return (
    <th className="px-2 py-2 font-semibold">
      <button
        onClick={() => onOrdina(colonna)}
        title={`Ordina per ${titolo.toLowerCase()}`}
        className={`flex items-center gap-1 uppercase tracking-wide transition hover:text-cielo-700 ${
          attiva ? 'text-cielo-700' : ''
        }`}
      >
        {titolo}
        <IconaOrdine attiva={attiva} crescente={ordine.crescente} />
      </button>
    </th>
  )
}

function IconaOrdine({ attiva, crescente }: { attiva: boolean; crescente: boolean }) {
  const acceso = 'fill-cielo-700'
  const spento = 'fill-cielo-300'
  return (
    <svg width="9" height="13" viewBox="0 0 10 14" className="shrink-0">
      <path d="M5 1 8.6 5.6H1.4z" className={attiva && crescente ? acceso : spento} />
      <path d="M5 13 1.4 8.4h7.2z" className={attiva && !crescente ? acceso : spento} />
    </svg>
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
  report: number[]
  reportAttesi?: number | null
  certificati?: CertificatoBM[]
  bimestri: BimestreBM[]
  sds1: string | null
  sds2: string | null
  svincolo_id: string | null
  svincolo_aut: string | null
  note: string | null
}): DatiBM {
  const vuoto = datiBMVuoti()
  return {
    // le lettere registrate prima degli allegati non hanno quei campi: si
    // rimettono a posto qui, altrimenti la pagina non riesce a disegnarsi
    lettera: r.lettera
      ? {
          ...r.lettera,
          compendi: Array.isArray(r.lettera.compendi) ? r.lettera.compendi : [],
          allegati: Array.isArray(r.lettera.allegati) ? r.lettera.allegati : [],
          documentoId: r.lettera.documentoId ?? null,
        }
      : null,
    fornitore: r.fornitore,
    nominativo: r.nominativo,
    recapito: r.recapito,
    categoria: r.categoria,
    periodo_dal: r.periodo_dal,
    periodo_al: r.periodo_al,
    fabbisogno: r.fabbisogno,
    call_off: r.call_off,
    report: Array.from({ length: 12 }, (_, i) => Number(r.report?.[i]) || 0),
    reportAttesi: r.reportAttesi ?? null,
    certificati: Array.isArray(r.certificati) ? r.certificati : [],
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
