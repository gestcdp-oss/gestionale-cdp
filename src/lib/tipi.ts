export type Immobile = {
  id: string
  asset: string
  denominazione: string
  portafoglio: string | null
  localizzazione: string | null
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

export type IncaricoBM = {
  id: string
  immobile_id: string
  anno: number
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
  /** consegna del report mensile: dodici caselle, da gennaio a dicembre */
  report: boolean[]
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
    fornitore: null,
    nominativo: null,
    recapito: null,
    categoria: null,
    periodo_dal: null,
    periodo_al: null,
    fabbisogno: null,
    call_off: null,
    report: Array(12).fill(false),
    bimestri: BIMESTRI.map(() => bimestreVuoto()),
    sds1: null,
    sds2: null,
    svincolo_id: null,
    svincolo_aut: null,
    note: null,
  }
}
