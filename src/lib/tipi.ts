export type Immobile = {
  id: string
  asset: string
  denominazione: string
  portafoglio: string | null
  localizzazione: string | null
  /** proposta dalla localizzazione, ma sempre correggibile a mano */
  regione: string | null
  creato_il: string
}

// ---------------------------------------------------------- Building Manager
// Ricalca il monitoraggio annuale dell'incarico di Building Management: un
// incarico per immobile e per anno, con la consegna dei report mese per mese e
// la fatturazione divisa in sei bimestri.

export type BimestreBM = {
  /** identificativo dell'ordine BEM del bimestre */
  idBem: string | null
  importo: number | null
  /** allegati GRECA - CAP: 'SI' | 'NO' | null (non richiesti) */
  allegati: string | null
  /** autorizzazione alla fatturazione: stato o importo autorizzato */
  autorizzazione: string | null
}

/**
 * Un documento caricato (lettera o allegato) conservato nell'archivio, così si
 * può riaprire quando serve. Il contenuto è il file stesso, in base64.
 */
export type Documento = {
  id: string
  /** nome mostrato all'utente */
  nome: string
  /** nome con cui il file vive nell'archivio: non può ripetersi mai */
  nomeArchivio?: string
  tipo: string
  dimensione: number
  caricato_il: string
  contenuto: string
}

/** Un allegato della lettera, con i dati letti dalla sua scheda intervento. */
export type AllegatoBM = {
  documentoId: string
  nome: string
  /** asset e denominazione del sito indicati nella scheda */
  asset: string | null
  sito: string | null
  lotto: string | null
  committente: string | null
  classe: string | null
  appaltatore: string | null
  dal: string | null
  al: string | null
  importoTotale: number | null
}

/** Un Certificato di Avvenuta Prestazione generato dal programma. */
export type CertificatoBM = {
  id: string
  /** il file nell'archivio dei documenti */
  documentoId: string
  /** nome parlante mostrato nell'elenco */
  nome: string
  generatoIl: string
  /** mesi coperti dal certificato: 1 = gennaio */
  mesi: number[]
}

/** Dati letti dalla Lettera di attivazione, conservati insieme all'incarico. */
export type LetteraBM = {
  nomeFile: string | null
  caricataIl: string | null
  fornitoreIndirizzo: string | null
  accordoData: string | null
  accordoNome: string | null
  tipoAttivazione: string | null
  codiceFiscaleBM: string | null
  /** importo delle prestazioni affidate, come scritto nella lettera */
  importo: number | null
  /** i compendi elencati nella lettera, così come sono scritti */
  compendi: string[]
  /** il file della lettera nell'archivio dei documenti (per riaprirla) */
  documentoId: string | null
  /** schede intervento e altri allegati della lettera */
  allegati: AllegatoBM[]
}

export type IncaricoBM = {
  id: string
  immobile_id: string
  anno: number
  /** null finché non si carica una Lettera di attivazione */
  lettera: LetteraBM | null
  fornitore: string | null
  /** nominativo del Building Manager incaricato */
  nominativo: string | null
  recapito: string | null
  /** categoria dell'immobile ai fini dell'incarico: A, B o C */
  categoria: string | null
  periodo_dal: string | null
  periodo_al: string | null
  /** fabbisogno netto per 12 mesi, in euro */
  fabbisogno: number | null
  /** call off dell'anno */
  call_off: string | null
  /** report consegnati mese per mese: dodici numeri (0, 1 o 2) */
  report: number[]
  /** quanti report al mese deve consegnare il fornitore (dalla classe) */
  reportAttesi: number | null
  /** certificati di avvenuta prestazione già emessi per quest'anno */
  certificati: CertificatoBM[]
  /** sei bimestri di fatturazione */
  bimestri: BimestreBM[]
  /** stato di servizio del primo e del secondo semestre */
  sds1: string | null
  sds2: string | null
  /** svincolo del 10% a fine incarico */
  svincolo_id: string | null
  svincolo_aut: string | null
  note: string | null
  aggiornato_il: string
}

/** Campi modificabili dell'incarico (l'identità la mette l'archivio). */
export type DatiBM = Omit<IncaricoBM, 'id' | 'immobile_id' | 'anno' | 'aggiornato_il'>

export const MESI_BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

/**
 * Report attesi ogni mese secondo la classe dell'immobile: gli immobili di
 * classe A ne richiedono due, gli altri uno. Resta modificabile dalla pagina.
 */
export function reportAttesiPerClasse(classe: string | null | undefined): number {
  return String(classe ?? '').trim().toUpperCase() === 'A' ? 2 : 1
}

/** Stati dell'autorizzazione alla fatturazione: vuoto significa "non ancora". */
export const STATI_AUTORIZZAZIONE = ['ok', 'inviare']

export const BIMESTRI = [
  { n: 1, mesi: 'gen-feb' },
  { n: 2, mesi: 'mar-apr' },
  { n: 3, mesi: 'mag-giu' },
  { n: 4, mesi: 'lug-ago' },
  { n: 5, mesi: 'set-ott' },
  { n: 6, mesi: 'nov-dic' },
]

export function bimestreVuoto(): BimestreBM {
  return { idBem: null, importo: null, allegati: null, autorizzazione: null }
}

export function datiBMVuoti(): DatiBM {
  return {
    lettera: null,
    fornitore: null,
    nominativo: null,
    recapito: null,
    categoria: null,
    periodo_dal: null,
    periodo_al: null,
    fabbisogno: null,
    call_off: null,
    report: Array(12).fill(0),
    reportAttesi: null,
    certificati: [],
    bimestri: BIMESTRI.map(() => bimestreVuoto()),
    sds1: null,
    sds2: null,
    svincolo_id: null,
    svincolo_aut: null,
    note: null,
  }
}
