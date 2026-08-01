// Lettura delle "Schede intervento", cioè gli allegati della Lettera di
// attivazione: una per immobile, con lotto, committente, sito, classe,
// appaltatore e importi. Nel PDF il testo esce in ordine sparso (è una tabella),
// perciò ogni dato si cerca con la sua impronta, non per posizione.

import { normalizza } from './letteraAttivazione'

export type DatiScheda = {
  /** l'oggetto dell'affidamento, per esteso */
  oggetto: string | null
  /** true se l'oggetto è un incarico di Building Manager */
  eBuildingManager: boolean
  dal: string | null // AAAA-MM-GG
  al: string | null
  lotto: string | null
  committente: string | null
  asset: string | null
  sito: string | null
  indirizzo: string | null
  provincia: string | null
  regione: string | null
  classe: string | null
  appaltatore: string | null
  importoBase: number | null
  ribasso: number | null
  importoTotale: number | null
}

const REGIONI = [
  'ABRUZZO', 'BASILICATA', 'CALABRIA', 'CAMPANIA', 'EMILIA-ROMAGNA', 'EMILIA ROMAGNA',
  'FRIULI-VENEZIA GIULIA', 'FRIULI VENEZIA GIULIA', 'LAZIO', 'LIGURIA', 'LOMBARDIA', 'MARCHE',
  'MOLISE', 'PIEMONTE', 'PUGLIA', 'SARDEGNA', 'SICILIA', 'TOSCANA', 'TRENTINO-ALTO ADIGE',
  'TRENTINO ALTO ADIGE', 'UMBRIA', "VALLE D'AOSTA", 'VENETO',
]

function dataIso(g: string, m: string, a: string): string | null {
  const giorno = Number(g)
  const mese = Number(m)
  const anno = Number(a.length === 2 ? `20${a}` : a)
  if (!giorno || !mese || !anno) return null
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
}

function importoItaliano(s: string): number | null {
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Legge una scheda intervento. Restituisce sempre quello che è riuscito a trovare. */
export function leggiScheda(testoGrezzo: string): DatiScheda {
  const testo = normalizza(testoGrezzo)
  const righe = testo
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
  const unaRiga = righe.join(' ').replace(/\s+/g, ' ')

  const dati: DatiScheda = {
    oggetto: null,
    eBuildingManager: false,
    dal: null,
    al: null,
    lotto: null,
    committente: null,
    asset: null,
    sito: null,
    indirizzo: null,
    provincia: null,
    regione: null,
    classe: null,
    appaltatore: null,
    importoBase: null,
    ribasso: null,
    importoTotale: null,
  }

  // --- oggetto dell'affidamento e durata: "Incarico di Building Manager dal … al …" ---
  const oggetto = unaRiga.match(
    /Incarico\s+di\s+([A-Za-zÀ-ÿ' ]+?)\s+dal\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+al\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
  )
  if (oggetto) {
    dati.oggetto = oggetto[0].trim()
    dati.eBuildingManager = /building\s+manage/i.test(oggetto[1])
    dati.dal = dataIso(oggetto[2], oggetto[3], oggetto[4])
    dati.al = dataIso(oggetto[5], oggetto[6], oggetto[7])
  } else {
    const soloOggetto = righe.find((r) => /^Incarico\s+di\s+/i.test(r))
    if (soloOggetto) {
      dati.oggetto = soloOggetto
      dati.eBuildingManager = /building\s+manage/i.test(soloOggetto)
    }
  }

  // --- sito: "0005 - TERRENI LOCALITA' SOCCAVO" (col numero asset davanti) ---
  for (const r of righe) {
    const m = r.match(/^(\d{3,5})\s*[-–]\s*(.{3,80})$/)
    if (m) {
      dati.asset = m[1]
      dati.sito = m[2].trim()
      break
    }
  }

  // --- lotto: la riga più completa che comincia con "LOTTO n" ---
  const lotti = righe.filter((r) => /^LOTTO\s*\d/i.test(r)).sort((a, b) => b.length - a.length)
  if (lotti.length) dati.lotto = lotti[0]

  // --- classe ---
  const classe = unaRiga.match(/Classe\s*:?\s*([A-Za-z])\b/i)
  if (classe) dati.classe = classe[1].toUpperCase()

  // --- regione e provincia: righe isolate tutte in maiuscolo ---
  dati.regione = righe.find((r) => REGIONI.includes(r.toUpperCase().trim())) ?? null

  // --- appaltatore: la riga "Nome ditta gg/mm/aaaa gg/mm/aaaa" ---
  for (const r of righe) {
    const m = r.match(/^(.{3,80}?)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (m) {
      dati.appaltatore = m[1].trim()
      if (!dati.dal) dati.dal = dataIso(m[2], m[3], m[4])
      if (!dati.al) dati.al = dataIso(m[5], m[6], m[7])
      break
    }
  }

  // --- committente: società che compare più volte e non è l'appaltatore ---
  const societa = new Map<string, number>()
  for (const r of righe) {
    if (r.length > 90 || /\d{2}\/\d{2}\/\d{4}/.test(r)) continue
    if (!/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|in liquidazione)\b/i.test(r)) continue
    societa.set(r, (societa.get(r) ?? 0) + 1)
  }
  const candidati = [...societa.entries()]
    .filter(([nome]) => !dati.appaltatore || !simili(nome, dati.appaltatore))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
  if (candidati.length) dati.committente = candidati[0][0]

  // --- indirizzo: riga con il CAP, che non sia il sito ---
  dati.indirizzo = righe.find((r) => /\b\d{5}\b/.test(r) && r !== dati.sito) ?? null
  if (dati.indirizzo) {
    const citta = dati.indirizzo.match(/\b\d{5}\s+(.+)$/)
    if (citta) dati.provincia = citta[1].trim()
  }

  // --- importi ---
  const base = unaRiga.match(/BASE\s+D'ASTA\s*\[?€?\]?\s*([\d.]+,\d{2})/i)
  if (base) dati.importoBase = importoItaliano(base[1])
  const totale = unaRiga.match(/IMPORTO\s+TOTALE\s*\[?€?\]?\s*([\d.]+,\d{2})/i)
  if (totale) dati.importoTotale = importoItaliano(totale[1])
  const ribasso = unaRiga.match(/([\d]{1,2},\d{2})\s*%/)
  if (ribasso) dati.ribasso = importoItaliano(ribasso[1])

  return dati
}

/** Due nomi si somigliano abbastanza da essere la stessa cosa? */
export function simili(a: string | null | undefined, b: string | null | undefined): boolean {
  const ripulisci = (s: string) =>
    normalizza(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|societa|srls)\b/g, ' ')
      .replace(/[^a-z0-9]/g, '')
  const x = ripulisci(String(a ?? ''))
  const y = ripulisci(String(b ?? ''))
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

export type Incoerenza = { campo: string; nellaScheda: string; nellIncarico: string }

/**
 * Confronta la scheda con l'incarico già registrato dalla Lettera di
 * attivazione: se qualcosa non torna, l'allegato è di un altro incarico.
 */
export function confrontaConIncarico(
  scheda: DatiScheda,
  atteso: {
    fornitore: string | null
    dal: string | null
    al: string | null
    portafoglio?: string | null
    categoria?: string | null
  },
): Incoerenza[] {
  const problemi: Incoerenza[] = []
  const dice = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '(non indicato)')

  if (scheda.appaltatore && atteso.fornitore && !simili(scheda.appaltatore, atteso.fornitore)) {
    problemi.push({ campo: 'Appaltatore', nellaScheda: scheda.appaltatore, nellIncarico: dice(atteso.fornitore) })
  }
  if (scheda.dal && atteso.dal && scheda.dal !== atteso.dal) {
    problemi.push({ campo: 'Inizio incarico', nellaScheda: scheda.dal, nellIncarico: atteso.dal })
  }
  if (scheda.al && atteso.al && scheda.al !== atteso.al) {
    problemi.push({ campo: 'Fine incarico', nellaScheda: scheda.al, nellIncarico: atteso.al })
  }
  if (scheda.classe && atteso.categoria && scheda.classe.toUpperCase() !== atteso.categoria.toUpperCase()) {
    problemi.push({ campo: 'Classe', nellaScheda: scheda.classe, nellIncarico: atteso.categoria })
  }
  return problemi
}
