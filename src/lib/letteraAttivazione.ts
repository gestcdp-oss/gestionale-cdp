// Lettura della "Lettera di attivazione incarico Building Manager".
//
// Il documento è sempre lo stesso nella sostanza ma cambia nome file e, nei PDF
// protocollati, va a capo in mezzo alle frasi: qui il testo viene prima
// normalizzato e ricucito, poi si cercano i dati uno per uno.

export type DatiLettera = {
  fornitore: string | null
  fornitoreIndirizzo: string | null
  accordoData: string | null // AAAA-MM-GG
  accordoNome: string | null
  tipoAttivazione: string | null
  /** denominazioni dei compendi, così come sono scritte nella lettera */
  compendi: string[]
  buildingManager: string | null
  codiceFiscaleBM: string | null
  importo: number | null
  decorrenza: string | null // AAAA-MM-GG
  scadenza: string | null // AAAA-MM-GG
  protocollo: string | null
  protocolloData: string | null // AAAA-MM-GG
}

export type EsitoLettura = {
  ok: boolean
  /** motivo per cui il documento non va bene (tipo di servizio sbagliato…) */
  problema?: string
  dati: DatiLettera
  /** avvisi non bloccanti: campi che non si sono trovati */
  mancanti: string[]
}

const VUOTI: DatiLettera = {
  fornitore: null,
  fornitoreIndirizzo: null,
  accordoData: null,
  accordoNome: null,
  tipoAttivazione: null,
  compendi: [],
  buildingManager: null,
  codiceFiscaleBM: null,
  importo: null,
  decorrenza: null,
  scadenza: null,
  protocollo: null,
  protocolloData: null,
}

/** Apostrofi, virgolette e trattini "tipografici" diventano quelli semplici. */
export function normalizza(testo: string): string {
  return String(testo ?? '')
    .replace(/\r/g, '')
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
}

function righeUtili(testo: string): string[] {
  return testo
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
}

/** gg/mm/aaaa → aaaa-mm-gg (il formato con cui l'archivio tiene le date) */
function dataIso(g: string, m: string, a: string): string | null {
  const giorno = Number(g)
  const mese = Number(m)
  const anno = Number(a.length === 2 ? `20${a}` : a)
  if (!giorno || !mese || !anno) return null
  const d = new Date(Date.UTC(anno, mese - 1, giorno))
  if (d.getUTCDate() !== giorno || d.getUTCMonth() !== mese - 1) return null
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
}

function cercaData(testo: string, dopo: RegExp): string | null {
  const m = testo.match(dopo)
  return m ? dataIso(m[1], m[2], m[3]) : null
}

/** "16.410,00" → 16410 */
function importoItaliano(s: string): number | null {
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Estrae i dati dell'incarico dal testo della lettera di attivazione.
 * Restituisce sempre i dati trovati: `ok` dice se il documento è del tipo
 * giusto, `mancanti` elenca i campi che non si sono potuti leggere.
 */
export function leggiLettera(testoGrezzo: string): EsitoLettura {
  const testo = normalizza(testoGrezzo)
  const righe = righeUtili(testo)
  // versione "ricucita": nei PDF le frasi vanno a capo dove capita
  const unaRiga = righe.join(' ').replace(/\s+/g, ' ')
  const dati: DatiLettera = { ...VUOTI, compendi: [] }

  // --- fornitore: le due righe subito dopo "Spett.le" ---
  const iSpett = righe.findIndex((r) => /^spett/i.test(r))
  if (iSpett >= 0) {
    dati.fornitore = righe[iSpett + 1] ?? null
    const indirizzo = righe[iSpett + 2] ?? ''
    // se la riga dopo è già la PEC o l'oggetto, l'indirizzo non c'è
    dati.fornitoreIndirizzo = /^(inviata|oggetto|pec)/i.test(indirizzo) ? null : indirizzo || null
  }

  // --- accordo quadro: data nell'oggetto, denominazione in maiuscolo ---
  dati.accordoData = cercaData(unaRiga, /accordo\s+quadro\s+del\s+(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i)
  const iOggetto = righe.findIndex((r) => /accordo\s+quadro\s+del/i.test(r))
  if (iOggetto >= 0) {
    // la denominazione è la prima riga tutta in maiuscolo dopo l'oggetto
    for (const r of righe.slice(iOggetto + 1, iOggetto + 6)) {
      const lettere = r.replace(/[^A-Za-zÀ-ÿ]/g, '')
      if (lettere.length >= 6 && lettere === lettere.toUpperCase()) {
        dati.accordoNome = r
        break
      }
    }
  }

  // --- tipo di attivazione: la riga che comincia con "Lettera di attivazione" ---
  dati.tipoAttivazione = righe.find((r) => /^lettera\s+di\s+attivazione/i.test(r)) ?? null

  // --- compendi: fra "…seguenti compendi:" e "con la presente prendiamo atto" ---
  const iDa = righe.findIndex((r) => /seguenti\s+compendi/i.test(r))
  const iA = righe.findIndex((r) => /con\s+la\s+presente\s+prendiamo\s+atto/i.test(r))
  if (iDa >= 0) {
    const fine = iA > iDa ? iA : righe.length
    const blocco = righe.slice(iDa + 1, fine)
    const conTrattino = blocco.some((r) => /^[-•*]\s*/.test(r))
    const voci: string[] = []
    for (const r of blocco) {
      if (conTrattino) {
        if (/^[-•*]\s*/.test(r)) voci.push(r.replace(/^[-•*]\s*/, '').trim())
        // riga senza trattino: è la coda di quella prima, spezzata dall'a capo
        else if (voci.length) voci[voci.length - 1] += ' ' + r.trim()
      } else {
        voci.push(r.trim())
      }
    }
    dati.compendi = voci.map((v) => v.replace(/\s+/g, ' ').trim()).filter(Boolean)
  }

  // --- Building Manager: quello che segue "…è la seguente:" ---
  const inizioFigura = unaRiga.search(/la\s+seguente\s*:?/i)
  if (inizioFigura >= 0) {
    // si prende la coda e la si taglia alla frase successiva: il nome può
    // avere punti (Arch., Ing.) e avere il codice fiscale attaccato
    const coda = unaRiga
      .slice(inizioFigura)
      .replace(/^la\s+seguente\s*:?\s*/i, '')
      .slice(0, 200)
    const pezzo = coda
      .split(/\s*(?:Il\s+rapporto|Distinti|In\s+ragione|L'incarico|Il\s+presente|Codesta)/i)[0]
      .trim()
    // nel documento Word nome e codice fiscale possono essere attaccati
    const cf = pezzo.match(/C\.?\s?F\.?\s*:?\s*([A-Za-z]{6}\d{2}[A-Za-z]\d{2}[A-Za-z]\d{3}[A-Za-z])/)
    dati.codiceFiscaleBM = cf ? cf[1].toUpperCase() : null
    dati.buildingManager =
      pezzo
        .replace(/C\.?\s?F\.?\s*:?\s*[A-Za-z0-9]{16}\.?/, '')
        .replace(/[.,;]\s*$/, '')
        .trim() || null
  }

  // --- importo delle prestazioni ---
  const imp = unaRiga.match(/importo\s+delle\s+prestazioni[^:]*:?\s*(?:€|EUR)?\s*([\d.]+,\d{2})/i)
  if (imp) dati.importo = importoItaliano(imp[1])

  // --- durata: decorrenza e scadenza ---
  dati.decorrenza = cercaData(unaRiga, /decorrenza\s+dal\s+(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i)
  dati.scadenza = cercaData(unaRiga, /scadenza\s+al\s+(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i)

  // --- protocollo (in fondo alla lettera protocollata) ---
  const prot = unaRiga.match(/U\s*(\d{6,8}\/\d{2})\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (prot) {
    dati.protocollo = prot[1]
    dati.protocolloData = dataIso(prot[2], prot[3], prot[4])
  }

  // --- controlli ---
  const parlaDiBM = /building\s+manager/i.test(dati.tipoAttivazione ?? '')
  const eUnaLettera = /lettera\s+di\s+attivazione/i.test(dati.tipoAttivazione ?? '') || /lettera\s+di\s+attivazione/i.test(unaRiga)
  let problema: string | undefined
  if (!eUnaLettera) {
    problema = "Questo documento non sembra una Lettera di attivazione: controlla di aver caricato il file giusto."
  } else if (!parlaDiBM) {
    problema = `Questa lettera non è per il Building Manager${
      dati.tipoAttivazione ? `: risulta «${dati.tipoAttivazione}»` : ''
    }. Carica la lettera dell'incarico di Building Management.`
  }

  const mancanti: string[] = []
  if (!dati.fornitore) mancanti.push('fornitore')
  if (!dati.buildingManager) mancanti.push('nominativo del Building Manager')
  if (!dati.importo) mancanti.push('importo delle prestazioni')
  if (!dati.decorrenza || !dati.scadenza) mancanti.push('durata dell\'incarico')
  if (dati.compendi.length === 0) mancanti.push('elenco dei compendi')

  return { ok: !problema, problema, dati, mancanti }
}

// ------------------------------------------------- riconoscimento degli immobili

const PAROLE_DEBOLI = new Set([
  'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'da', 'in', 'il', 'lo', 'la', 'i', 'gli', 'le',
  'e', 'ed', 'a', 'al', 'alla', 'con', 'su', 'per', 'via', 'viale', 'piazza', 'piazzale', 'corso', 'largo',
  'vicolo', 'strada', 'contrada', 'localita', 'loc', 'snc', 'n', 'nr', 'civico', 'ex', 'palazzina',
  'palazzo', 'edificio', 'immobile', 'compendio', 'terreni', 'terreno', 'area', 'aree', 'lotto',
])

/** Toglie accenti, punteggiatura e maiuscole: resta solo l'osso del nome. */
export function chiaviDi(testo: string): string[] {
  return normalizza(testo)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 2 && !PAROLE_DEBOLI.has(p) && !/^\d+$/.test(p))
}

export type Candidato<T> = { immobile: T; punteggio: number; comuni: string[] }

/**
 * Cerca fra gli immobili dell'archivio quelli che somigliano alla riga della
 * lettera. Il punteggio è la quota di parole significative in comune.
 */
export function cercaCorrispondenze<T extends { denominazione: string; localizzazione?: string | null }>(
  rigaLettera: string,
  immobili: T[],
): Candidato<T>[] {
  const chiaviRiga = new Set(chiaviDi(rigaLettera))
  if (chiaviRiga.size === 0) return []

  // una parola che compare in mezzo archivio (per esempio la città) conta poco;
  // un nome che compare in un solo immobile vale molto
  const quantiLaUsano = new Map<string, number>()
  const chiaviPerImmobile = immobili.map((im) => {
    const chiavi = new Set([...chiaviDi(im.denominazione), ...chiaviDi(im.localizzazione ?? '')])
    for (const c of chiavi) quantiLaUsano.set(c, (quantiLaUsano.get(c) ?? 0) + 1)
    return chiavi
  })
  const peso = (c: string) => 1 / (1 + (quantiLaUsano.get(c) ?? 0))

  const trovati: Candidato<T>[] = []
  immobili.forEach((im, i) => {
    const chiaviImmobile = chiaviPerImmobile[i]
    const comuni = [...chiaviRiga].filter((c) => chiaviImmobile.has(c))
    if (comuni.length === 0) return
    const insieme = new Set([...chiaviRiga, ...chiaviImmobile])
    const somma = (elenco: Iterable<string>) => [...elenco].reduce((s, c) => s + peso(c), 0)
    const totale = somma(insieme)
    trovati.push({ immobile: im, punteggio: totale ? somma(comuni) / totale : 0, comuni })
  })
  return trovati.sort(
    (a, b) => b.punteggio - a.punteggio || a.immobile.denominazione.localeCompare(b.immobile.denominazione),
  )
}

/** Giorni che mancano alla data indicata (negativi se è già passata). */
export function giorniAlla(data: string | null | undefined): number | null {
  if (!data) return null
  const fine = new Date(`${data}T00:00:00`)
  if (Number.isNaN(fine.getTime())) return null
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  return Math.round((fine.getTime() - oggi.getTime()) / 86400000)
}
