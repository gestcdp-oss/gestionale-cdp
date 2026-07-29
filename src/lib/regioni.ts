// Regione dedotta dalla localizzazione dell'immobile.
//
// Non serve nessun servizio esterno: la regione si ricava dal CAP contenuto
// nell'indirizzo. Le prime due cifre del CAP individuano la provincia; dove una
// stessa coppia copre province di regioni diverse (46 Mantova, 47 Rimini…) la
// tabella delle eccezioni usa le tre cifre.

const PER_DUE_CIFRE: Record<string, string> = {
  '00': 'Lazio', '01': 'Lazio', '02': 'Lazio', '03': 'Lazio', '04': 'Lazio',
  '05': 'Umbria', '06': 'Umbria',
  '07': 'Sardegna', '08': 'Sardegna', '09': 'Sardegna',
  '10': 'Piemonte', '11': "Valle d'Aosta", '12': 'Piemonte', '13': 'Piemonte', '14': 'Piemonte',
  '15': 'Piemonte', '16': 'Liguria', '17': 'Liguria', '18': 'Liguria', '19': 'Liguria',
  '20': 'Lombardia', '21': 'Lombardia', '22': 'Lombardia', '23': 'Lombardia', '24': 'Lombardia',
  '25': 'Lombardia', '26': 'Lombardia', '27': 'Lombardia',
  '28': 'Piemonte', '29': 'Emilia-Romagna',
  '30': 'Veneto', '31': 'Veneto', '32': 'Veneto', '33': 'Friuli-Venezia Giulia', '34': 'Friuli-Venezia Giulia',
  '35': 'Veneto', '36': 'Veneto', '37': 'Veneto', '38': 'Trentino-Alto Adige', '39': 'Trentino-Alto Adige',
  '40': 'Emilia-Romagna', '41': 'Emilia-Romagna', '42': 'Emilia-Romagna', '43': 'Emilia-Romagna',
  '44': 'Emilia-Romagna', '45': 'Veneto', '46': 'Lombardia', '47': 'Emilia-Romagna', '48': 'Emilia-Romagna',
  '50': 'Toscana', '51': 'Toscana', '52': 'Toscana', '53': 'Toscana', '54': 'Toscana',
  '55': 'Toscana', '56': 'Toscana', '57': 'Toscana', '58': 'Toscana', '59': 'Toscana',
  '60': 'Marche', '61': 'Marche', '62': 'Marche', '63': 'Marche', '64': 'Abruzzo',
  '65': 'Abruzzo', '66': 'Abruzzo', '67': 'Abruzzo',
  '70': 'Puglia', '71': 'Puglia', '72': 'Puglia', '73': 'Puglia', '74': 'Puglia', '76': 'Puglia',
  '75': 'Basilicata', '85': 'Basilicata',
  '80': 'Campania', '81': 'Campania', '82': 'Campania', '83': 'Campania', '84': 'Campania',
  '86': 'Molise', '87': 'Calabria', '88': 'Calabria', '89': 'Calabria',
  '90': 'Sicilia', '91': 'Sicilia', '92': 'Sicilia', '93': 'Sicilia', '94': 'Sicilia',
  '95': 'Sicilia', '96': 'Sicilia', '97': 'Sicilia', '98': 'Sicilia',
}

// province "a cavallo" fra due regioni: qui decidono le prime tre cifre
const PER_TRE_CIFRE: Record<string, string> = {
  '470': 'Emilia-Romagna', // Forlì-Cesena
  '471': 'Emilia-Romagna',
  '472': 'Emilia-Romagna',
  '473': 'Emilia-Romagna',
  '478': 'Emilia-Romagna',
  '479': 'Emilia-Romagna', // Rimini
  '670': 'Abruzzo',
  '860': 'Molise', // Campobasso
  '861': 'Molise',
  '862': "Abruzzo", // L'Aquila
  '863': 'Abruzzo',
  '864': 'Abruzzo',
  '865': 'Molise', // Isernia
  '866': 'Molise',
  '867': 'Abruzzo',
}

/** Nomi di regione riconosciuti se scritti direttamente nella localizzazione. */
const REGIONI = [
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia',
  'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna',
  'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
]

/**
 * Regione dell'immobile ricavata dall'indirizzo: prima si cerca il CAP, poi il
 * nome della regione scritto per esteso. Restituisce null se non si capisce.
 */
export function regioneDaLocalizzazione(localizzazione: string | null | undefined): string | null {
  const testo = String(localizzazione ?? '').trim()
  if (!testo) return null

  // un CAP è un numero di cinque cifre non attaccato ad altri numeri
  const cap = testo.match(/(?<!\d)(\d{5})(?!\d)/)
  if (cap) {
    const c = cap[1]
    const perTre = PER_TRE_CIFRE[c.slice(0, 3)]
    if (perTre) return perTre
    const perDue = PER_DUE_CIFRE[c.slice(0, 2)]
    if (perDue) return perDue
  }

  const minuscolo = testo.toLowerCase()
  const scritta = REGIONI.find((r) => minuscolo.includes(r.toLowerCase()))
  if (scritta) return scritta
  // forme abbreviate d'uso comune
  if (/\bfriuli\b/.test(minuscolo)) return 'Friuli-Venezia Giulia'
  if (/\btrentino\b|\balto adige\b|\bsüdtirol\b/.test(minuscolo)) return 'Trentino-Alto Adige'
  if (/\bemilia\b|\bromagna\b/.test(minuscolo)) return 'Emilia-Romagna'
  if (/\bval d'aosta\b|\bvalle d'aosta\b|\baosta\b/.test(minuscolo)) return "Valle d'Aosta"
  return null
}
