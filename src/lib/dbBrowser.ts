// Versione BROWSER del motore dati: stessa interfaccia dell'app desktop, ma
// l'archivio vive nella memoria locale del browser (IndexedDB) del computer.
// Nessun dato viene inviato su internet: la pagina è solo il "programma".

import type {
  ApiTravi,
  RispostaDb,
  Utente,
  NuovoUtente,
  ImmobileInput,
  AnteprimaImport,
  StatoAggiornamento,
} from './db'
import type { Immobile, IncaricoBM, DatiBM, Documento, AllegatoBM } from './tipi'
import { BIMESTRI, bimestreVuoto, datiBMVuoti } from './tipi'
import { regioneDaLocalizzazione } from './regioni'

const ADMIN_PERMANENTE = 'marabelli.s@gmail.com'
const FORMATO_ESPORTAZIONE = 'travi-dati-1'
const FORMATO_ARCHIVIO = 'travi-archivio-1'
const CHIAVE_SESSIONE = 'travi_sessione'

// nome del file dell'archivio dentro la cartella scelta dall'utente
const NOME_ARCHIVIO = 'TRAVI-archivio.travidb'
const CARTELLA_BACKUP = 'backup'
const MAX_BACKUP = 30

// --- accesso ai file del computer (Edge/Chrome): dichiarazioni minime ---
type PermessoFile = 'granted' | 'denied' | 'prompt'
interface HandleFile {
  name: string
  kind?: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermessoFile>
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermessoFile>
}
interface HandleCartella {
  name: string
  kind?: string
  getFileHandle(nome: string, opzioni?: { create?: boolean }): Promise<HandleFile>
  getDirectoryHandle(nome: string, opzioni?: { create?: boolean }): Promise<HandleCartella>
  removeEntry(nome: string, opzioni?: { recursive?: boolean }): Promise<void>
  values(): AsyncIterable<HandleFile | HandleCartella>
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermessoFile>
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermessoFile>
}
declare global {
  interface Window {
    showSaveFilePicker?: (opzioni?: unknown) => Promise<HandleFile>
    showOpenFilePicker?: (opzioni?: unknown) => Promise<HandleFile[]>
    showDirectoryPicker?: (opzioni?: unknown) => Promise<HandleCartella>
  }
}

// ---------------------------------------------------------------- IndexedDB

const NOME_DB = 'travi'

function apriIdb(): Promise<IDBDatabase> {
  return new Promise((risolvi, rifiuta) => {
    // versione 3: incarichi di Building Management e documenti caricati
    const ric = indexedDB.open(NOME_DB, 3)
    ric.onupgradeneeded = () => {
      const db = ric.result
      if (!db.objectStoreNames.contains('utenti')) db.createObjectStore('utenti', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('immobili')) db.createObjectStore('immobili', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('preferenze')) db.createObjectStore('preferenze', { keyPath: 'k' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' })
      if (!db.objectStoreNames.contains('bm')) db.createObjectStore('bm', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('documenti')) db.createObjectStore('documenti', { keyPath: 'id' })
    }
    ric.onsuccess = () => risolvi(ric.result)
    ric.onerror = () => rifiuta(ric.error ?? new Error('Archivio locale non disponibile.'))
  })
}

async function tutti<T>(store: string): Promise<T[]> {
  const db = await apriIdb()
  return new Promise((risolvi, rifiuta) => {
    const ric = db.transaction(store, 'readonly').objectStore(store).getAll()
    ric.onsuccess = () => risolvi(ric.result as T[])
    ric.onerror = () => rifiuta(ric.error)
  })
}

// true mentre si stanno caricando dati DAL file: in quel momento non bisogna
// riscrivere il file con ciò che si sta appena leggendo
let inSincronizzazione = false

async function metti(store: string, valore: unknown): Promise<void> {
  const db = await apriIdb()
  await new Promise<void>((risolvi, rifiuta) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(valore)
    tx.oncomplete = () => risolvi()
    tx.onerror = () => rifiuta(tx.error)
  })
  if (store !== 'meta' && !inSincronizzazione) programmaSpecchio()
}

async function togli(store: string, chiave: string): Promise<void> {
  const db = await apriIdb()
  await new Promise<void>((risolvi, rifiuta) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(chiave)
    tx.oncomplete = () => risolvi()
    tx.onerror = () => rifiuta(tx.error)
  })
  if (store !== 'meta' && !inSincronizzazione) programmaSpecchio()
}

async function svuota(store: string): Promise<void> {
  const db = await apriIdb()
  await new Promise<void>((risolvi, rifiuta) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => risolvi()
    tx.onerror = () => rifiuta(tx.error)
  })
  if (store !== 'meta' && !inSincronizzazione) programmaSpecchio()
}

async function prendiMeta(k: string): Promise<{ k: string; [x: string]: unknown } | null> {
  const db = await apriIdb()
  return new Promise((risolvi, rifiuta) => {
    const ric = db.transaction('meta', 'readonly').objectStore('meta').get(k)
    ric.onsuccess = () => risolvi((ric.result as { k: string }) ?? null)
    ric.onerror = () => rifiuta(ric.error)
  })
}

// ------------------------------------------------- archivio su FILE del computer
// L'archivio primario resta nel browser (veloce); in più, se l'utente collega un
// file, TUTTO viene specchiato lì a ogni modifica. Il file sul disco sopravvive
// alle pulizie del browser e può essere aperto da un browser diverso.

export function supportaArchivioFile(): boolean {
  return !window.travi && typeof window.showSaveFilePicker === 'function'
}

async function leggiHandle(): Promise<HandleFile | null> {
  try {
    const riga = await prendiMeta('fileArchivio')
    return (riga?.h as HandleFile) ?? null
  } catch {
    return null
  }
}

/** Cartella scelta dall'utente: dentro ci stanno l'archivio e le sue copie. */
async function leggiCartella(): Promise<HandleCartella | null> {
  try {
    const riga = await prendiMeta('cartellaArchivio')
    return (riga?.h as HandleCartella) ?? null
  } catch {
    return null
  }
}

/** Verifica (ed eventualmente chiede) il permesso di scrittura su file o cartella. */
async function permessoScrittura(
  handle: { queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermessoFile>; requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermessoFile> },
  conRichiesta: boolean,
): Promise<boolean> {
  // se il browser non espone i permessi sull'handle, si prova a scrivere:
  // in caso di rifiuto sarà la scrittura stessa a fallire
  if (typeof handle.queryPermission !== 'function') return true
  let permesso: PermessoFile = await handle.queryPermission({ mode: 'readwrite' })
  if (permesso === 'prompt' && conRichiesta) {
    permesso = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied'
  }
  return permesso === 'granted'
}

/** Marca temporale ordinabile per i nomi delle copie: 2026-07-29_1145-30 */
function marcaTemporale(): string {
  const d = new Date()
  const due = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}_${due(d.getHours())}${due(d.getMinutes())}-${due(d.getSeconds())}`
}

async function generaDump(): Promise<{ testo: string; salvatoIl: string }> {
  const [utenti, immobili, preferenze, bm, documenti] = await Promise.all([
    tutti<UtenteArchivio>('utenti'),
    tutti<Immobile>('immobili'),
    tutti<{ k: string; v: string }>('preferenze'),
    tutti<IncaricoBM>('bm'),
    tutti<Documento>('documenti'),
  ])
  const salvatoIl = new Date().toISOString()
  return {
    salvatoIl,
    testo: JSON.stringify(
      {
        formato: FORMATO_ARCHIVIO,
        versione_app: __APP_VERSION__,
        salvato_il: salvatoIl,
        utenti,
        immobili,
        preferenze,
        bm,
        documenti,
      },
      null,
      1,
    ),
  }
}

let attesaSpecchio: number | undefined

function programmaSpecchio(): void {
  if (!supportaArchivioFile()) return
  window.clearTimeout(attesaSpecchio)
  attesaSpecchio = window.setTimeout(() => void specchiaOra(false), 600)
}

/** Scrive l'archivio nel file collegato. Con `conRichiesta` può chiedere il permesso. */
async function specchiaOra(conRichiesta: boolean): Promise<boolean> {
  try {
    const handle = await leggiHandle()
    if (!handle) return false
    if (!(await permessoScrittura(handle, conRichiesta))) return false
    const { testo, salvatoIl } = await generaDump()
    const w = await handle.createWritable()
    await w.write(testo)
    await w.close()
    await metti('meta', { k: 'ultimoSalvataggioFile', v: salvatoIl })
    return true
  } catch {
    return false
  }
}

/**
 * Riallinea questo browser dal file, se il file contiene dati più recenti
 * (cioè scritti da un altro browser). È ciò che permette di passare da Edge a
 * Chrome e ritrovare sempre gli stessi dati: il FILE è la fonte di verità.
 */
async function sincronizzaDaFile(conRichiesta: boolean): Promise<'importato' | 'invariato' | 'niente'> {
  try {
    const handle = await leggiHandle()
    if (!handle) return 'niente'
    if (!(await permessoScrittura(handle, conRichiesta))) return 'niente'

    const testo = await (await handle.getFile()).text()
    let dump: {
      formato?: string
      salvato_il?: string
      utenti?: UtenteArchivio[]
      immobili?: Immobile[]
      preferenze?: { k: string; v: string }[]
      bm?: IncaricoBM[]
      documenti?: Documento[]
    }
    try {
      dump = JSON.parse(testo)
    } catch {
      return 'niente'
    }
    if (dump?.formato !== FORMATO_ARCHIVIO || !Array.isArray(dump.utenti)) return 'niente'

    const marcaFile = String(dump.salvato_il || '')
    const marcaLocale = String((await prendiMeta('ultimoSalvataggioFile'))?.v ?? '')
    if (!marcaFile || marcaFile <= marcaLocale) return 'invariato'

    inSincronizzazione = true
    try {
      await svuota('utenti')
      await svuota('immobili')
      await svuota('preferenze')
      await svuota('bm')
      await svuota('documenti')
      for (const u of dump.utenti) await metti('utenti', u)
      for (const i of dump.immobili ?? []) await metti('immobili', i)
      for (const p of dump.preferenze ?? []) await metti('preferenze', p)
      for (const b of dump.bm ?? []) await metti('bm', b)
      for (const d of dump.documenti ?? []) await metti('documenti', d)
      await metti('meta', { k: 'ultimoSalvataggioFile', v: marcaFile })
    } finally {
      inSincronizzazione = false
    }
    // se l'utente della sessione non esiste più nell'archivio, la sessione decade
    const sess = leggiSessione()
    if (sess && !dump.utenti.some((u) => u.id === sess.id)) scriviSessione(null)
    // avvisa l'interfaccia: i dati mostrati vanno ricaricati
    try {
      window.dispatchEvent(new CustomEvent('travi-archivio-importato'))
    } catch {
      /* ignora */
    }
    return 'importato'
  } catch {
    return 'niente'
  }
}

// ------------------------------------------------- aggiornamento del programma
// I dati non sono mai in cache; il PROGRAMMA però sì (il browser può tenere la
// pagina vecchia fino a ~10 minuti). Qui si controlla version.json in rete e,
// se è diversa, si ricarica con un indirizzo "sporcato" che scavalca la cache.

export function eModalitaBrowser(): boolean {
  return !window.travi
}

export function urlConVersione(v: string): string {
  const { origin, pathname, hash } = window.location
  return `${origin}${pathname}?v=${encodeURIComponent(v)}${hash}`
}

async function versioneInRete(): Promise<string | null> {
  try {
    const r = await fetch(`./version.json?_=${Date.now()}`, { cache: 'no-store' })
    const d = (await r.json()) as { version?: string }
    return typeof d.version === 'string' ? d.version : null
  } catch {
    return null
  }
}

function avvisaNuovaVersione(v: string): void {
  try {
    window.dispatchEvent(new CustomEvent('travi-versione-nuova', { detail: v }))
  } catch {
    /* ignora */
  }
}

function agganciaAggiornamentoWeb(): void {
  // all'AVVIO: se in rete c'è una versione diversa, si ricarica subito
  // (siamo prima di qualsiasi lavoro: il momento sicuro per farlo)
  void (async () => {
    const v = await versioneInRete()
    if (!v || v === __APP_VERSION__) return
    const chiave = `travi_ricaricato_${v}`
    try {
      if (sessionStorage.getItem(chiave)) {
        // già provato in questa sessione: niente cicli, si avvisa soltanto
        avvisaNuovaVersione(v)
        return
      }
      sessionStorage.setItem(chiave, 'si')
    } catch {
      /* ignora */
    }
    window.location.replace(urlConVersione(v))
  })()

  // DURANTE l'uso: controllo periodico e al ritorno sulla finestra → avviso
  let ultimoControlloVersione = 0
  const controlla = async () => {
    const adesso = Date.now()
    if (adesso - ultimoControlloVersione < 60000) return
    ultimoControlloVersione = adesso
    const v = await versioneInRete()
    if (v && v !== __APP_VERSION__) avvisaNuovaVersione(v)
  }
  window.setInterval(() => void controlla(), 15 * 60 * 1000)
  window.addEventListener('focus', () => void controlla())
}

// Riallineamento anche quando si TORNA sulla finestra (cambio scheda/app):
// così, alternando i browser, i dati si aggiornano senza dover riaccedere.
let ultimoControlloFile = 0

function agganciaRiallineamento(): void {
  const controlla = () => {
    const adesso = Date.now()
    if (adesso - ultimoControlloFile < 5000) return // non più di una volta ogni 5s
    ultimoControlloFile = adesso
    void sincronizzaDaFile(false)
  }
  window.addEventListener('focus', controlla)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') controlla()
  })
}

export type StatoArchivioFile = {
  supportato: boolean
  collegato: boolean
  nomeFile: string
  /** cartella scelta dall'utente: lì stanno l'archivio e la sottocartella backup */
  cartella: string
  ultimoSalvataggio: string
  permesso: PermessoFile | 'n/d'
}

export async function statoArchivioFile(): Promise<StatoArchivioFile> {
  if (!supportaArchivioFile()) {
    return { supportato: false, collegato: false, nomeFile: '', cartella: '', ultimoSalvataggio: '', permesso: 'n/d' }
  }
  const handle = await leggiHandle()
  const cartella = await leggiCartella()
  const ultimo = await prendiMeta('ultimoSalvataggioFile')
  return {
    supportato: true,
    collegato: Boolean(handle),
    nomeFile: handle?.name ?? '',
    cartella: cartella?.name ?? '',
    ultimoSalvataggio: String(ultimo?.v ?? ''),
    permesso: handle ? ((await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt') : 'n/d',
  }
}

// ------------------------------------------------------------- copie di sicurezza

/** Scrive un testo nella sottocartella "backup" (creandola se non c'è). */
async function scriviBackup(testo: string, etichetta: string): Promise<string | null> {
  const cartella = await leggiCartella()
  if (!cartella) return null
  if (!(await permessoScrittura(cartella, false))) return null
  try {
    const dir = await cartella.getDirectoryHandle(CARTELLA_BACKUP, { create: true })
    const nome = await nomeLibero(dir, `TRAVI-${etichetta}-${marcaTemporale()}`)
    const h = await dir.getFileHandle(nome, { create: true })
    const w = await h.createWritable()
    await w.write(testo)
    await w.close()
    await potaBackup(dir)
    return nome
  } catch {
    return null
  }
}

/**
 * Nome non ancora usato dentro la cartella: due salvataggi nello stesso secondo
 * devono restare due copie distinte, non una sovrascritta.
 */
async function nomeLibero(dir: HandleCartella, base: string): Promise<string> {
  for (let n = 1; n <= 99; n++) {
    const nome = n === 1 ? `${base}.travidb` : `${base}-${String(n).padStart(2, '0')}.travidb`
    try {
      await dir.getFileHandle(nome)
    } catch {
      return nome // non esiste: è libero
    }
  }
  return `${base}-${Math.floor(Math.random() * 1000)}.travidb`
}

/** Tiene solo le copie più recenti: le vecchie vengono eliminate. */
async function potaBackup(dir: HandleCartella): Promise<void> {
  try {
    const nomi: string[] = []
    for await (const voce of dir.values()) {
      if (voce.kind !== 'directory' && voce.name.endsWith('.travidb')) nomi.push(voce.name)
    }
    // la marca temporale nel nome rende l'ordine alfabetico anche cronologico
    nomi.sort()
    for (const vecchio of nomi.slice(0, Math.max(0, nomi.length - MAX_BACKUP))) {
      await dir.removeEntry(vecchio)
    }
  } catch {
    /* la pulizia non deve mai far fallire il salvataggio */
  }
}

export type VoceBackup = { nome: string; data: string; dimensione: number }

/** Elenca le copie presenti nella cartella backup, dalla più recente. */
export async function elencaBackup(): Promise<VoceBackup[]> {
  const cartella = await leggiCartella()
  if (!cartella) return []
  try {
    if (!(await permessoScrittura(cartella, true))) return []
    const dir = await cartella.getDirectoryHandle(CARTELLA_BACKUP, { create: true })
    const voci: VoceBackup[] = []
    for await (const voce of dir.values()) {
      if (voce.kind === 'directory' || !voce.name.endsWith('.travidb')) continue
      const f = await (voce as HandleFile).getFile()
      voci.push({ nome: voce.name, data: new Date(f.lastModified).toISOString(), dimensione: f.size })
    }
    return voci.sort((a, b) => (a.data < b.data ? 1 : -1))
  } catch {
    return []
  }
}

/** Ripristina i dati da una copia: sostituisce tutto, utenti compresi. */
export async function ripristinaDaBackup(nome: string): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const cartella = await leggiCartella()
    if (!cartella) return { ok: false, messaggio: 'Nessuna cartella archivio impostata.' }
    if (!(await permessoScrittura(cartella, true))) {
      return { ok: false, messaggio: 'Permesso negato sulla cartella dell\'archivio.' }
    }
    const dir = await cartella.getDirectoryHandle(CARTELLA_BACKUP, { create: true })
    const h = await dir.getFileHandle(nome)
    const dump = JSON.parse(await (await h.getFile()).text()) as {
      formato?: string
      utenti?: UtenteArchivio[]
      immobili?: Immobile[]
      preferenze?: { k: string; v: string }[]
      bm?: IncaricoBM[]
      documenti?: Documento[]
    }
    if (dump.formato !== FORMATO_ARCHIVIO || !Array.isArray(dump.utenti)) {
      return { ok: false, messaggio: 'Questa copia non è leggibile.' }
    }
    // prima di sovrascrivere, si mette al sicuro lo stato attuale
    const { testo } = await generaDump()
    await scriviBackup(testo, 'prima-del-ripristino')
    inSincronizzazione = true
    try {
      await svuota('utenti')
      await svuota('immobili')
      await svuota('preferenze')
      await svuota('bm')
      await svuota('documenti')
      for (const u of dump.utenti) await metti('utenti', u)
      for (const i of dump.immobili ?? []) await metti('immobili', i)
      for (const p of dump.preferenze ?? []) await metti('preferenze', p)
      for (const b of dump.bm ?? []) await metti('bm', b)
      for (const d of dump.documenti ?? []) await metti('documenti', d)
    } finally {
      inSincronizzazione = false
    }
    await specchiaOra(true)
    const sess = leggiSessione()
    if (sess && !dump.utenti.some((u) => u.id === sess.id)) scriviSessione(null)
    try {
      window.dispatchEvent(new CustomEvent('travi-archivio-importato'))
    } catch {
      /* ignora */
    }
    return {
      ok: true,
      messaggio: `Ripristinata la copia ${nome}: ${(dump.immobili ?? []).length} immobili e ${dump.utenti.length} utenti.`,
    }
  } catch (e) {
    return { ok: false, messaggio: String((e as Error)?.message ?? e) }
  }
}

/** Elimina dal computer il file dell'archivio in uso. Le copie restano. */
export async function cancellaArchivioFile(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const cartella = await leggiCartella()
    const handle = await leggiHandle()
    if (!handle) return { ok: false, messaggio: 'Nessun archivio in uso.' }
    // copia di sicurezza prima di cancellare: il ripristino resta sempre possibile
    const { testo } = await generaDump()
    const copia = await scriviBackup(testo, 'prima-della-cancellazione')
    if (cartella) {
      if (!(await permessoScrittura(cartella, true))) {
        return { ok: false, messaggio: 'Permesso negato sulla cartella dell\'archivio.' }
      }
      try {
        await cartella.removeEntry(handle.name)
      } catch {
        return { ok: false, messaggio: 'Il file non è stato trovato nella cartella: potrebbe essere già stato spostato.' }
      }
    }
    await togli('meta', 'fileArchivio')
    await togli('meta', 'ultimoSalvataggioFile')
    return {
      ok: true,
      messaggio: cartella
        ? `Archivio "${handle.name}" eliminato dal computer.${copia ? ` Copia di sicurezza salvata in ${CARTELLA_BACKUP}\\${copia}.` : ''}`
        : `Archivio scollegato. Il file "${handle.name}" va eliminato a mano: senza cartella impostata il programma non può toccarlo.`,
    }
  } catch (e) {
    return { ok: false, messaggio: String((e as Error)?.message ?? e) }
  }
}

/**
 * Sceglie la CARTELLA dove vive l'archivio (predefinita: Documenti) e vi
 * installa il file dell'archivio, con dentro i dati attuali. È l'unica porta
 * per decidere "dove si salva": la usano anche crea/apri/importa.
 */
export async function scegliPosizioneArchivio(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    if (!window.showDirectoryPicker) {
      return { ok: false, messaggio: 'Questo browser non permette di scegliere una cartella: usa Edge o Chrome.' }
    }
    const cartella = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' })
    if (!(await permessoScrittura(cartella, true))) {
      return { ok: false, messaggio: 'Permesso di scrittura negato sulla cartella scelta.' }
    }
    await metti('meta', { k: 'cartellaArchivio', h: cartella })

    // se lì c'è già un archivio, se ne conserva una copia prima di sostituirlo
    let esistente: string | null = null
    try {
      const vecchio = await cartella.getFileHandle(NOME_ARCHIVIO)
      esistente = await (await vecchio.getFile()).text()
    } catch {
      /* nessun archivio precedente in questa cartella */
    }
    if (esistente) await scriviBackup(esistente, 'archivio-sostituito')

    const file = await cartella.getFileHandle(NOME_ARCHIVIO, { create: true })
    await metti('meta', { k: 'fileArchivio', h: file })
    const scritto = await specchiaOra(true)
    if (!scritto) return { ok: false, messaggio: 'Cartella scelta ma scrittura non riuscita: riprova con "Salva ora".' }
    return {
      ok: true,
      messaggio: `Archivio in uso: ${cartella.name}\\${NOME_ARCHIVIO}.${esistente ? ' L\'archivio che era già lì è stato messo nella cartella backup.' : ''}`,
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, messaggio: '' }
    return { ok: false, messaggio: String((e as Error)?.message ?? e) }
  }
}

/**
 * Sostituisce gli immobili con quelli di un pacchetto di soli dati, lasciando
 * intatti utenti e preferenze. Usata sia dall'importazione esplicita sia
 * dall'apertura di un file, così l'utente non deve indovinare il pulsante.
 */
async function sostituisciImmobili(righe: ImmobileInput[], bm?: BMEsportato[]): Promise<number> {
  // niente guardia: le scritture devono finire anche nel file collegato
  await svuota('immobili')
  // gli identificativi cambiano a ogni importazione: gli incarichi si
  // riagganciano tramite il numero asset, che invece è stabile
  const idPerAsset = new Map<string, string>()
  let importati = 0
  for (const r of righe) {
    const asset = pulisci(r.asset)
    const den = pulisci(r.denominazione)
    if (!asset || !den) continue
    const id = crypto.randomUUID()
    idPerAsset.set(asset.toLowerCase(), id)
    const localizzazione = pulisci(r.localizzazione)
    await metti('immobili', {
      id,
      asset,
      denominazione: den,
      portafoglio: pulisci(r.portafoglio),
      localizzazione,
      regione: pulisci(r.regione) ?? regioneDaLocalizzazione(localizzazione),
      creato_il: new Date().toISOString(),
    } satisfies Immobile)
    importati++
  }
  if (Array.isArray(bm)) {
    await svuota('bm')
    for (const b of bm) {
      const immobileId = idPerAsset.get(String(b.asset ?? '').trim().toLowerCase())
      const anno = Number(b.anno)
      if (!immobileId || !Number.isFinite(anno)) continue
      await metti('bm', {
        ...normalizzaBM(b),
        id: crypto.randomUUID(),
        immobile_id: immobileId,
        anno,
        aggiornato_il: new Date().toISOString(),
      } satisfies IncaricoBM)
    }
  }
  try {
    window.dispatchEvent(new CustomEvent('travi-archivio-importato'))
  } catch {
    /* ignora */
  }
  return importati
}

/**
 * Apre un archivio esistente e lo carica al posto dei dati di questo browser.
 * Se il file scelto contiene SOLI DATI (.travidati, senza utenti) non lo tratta
 * come errore: ne importa gli immobili e lo segnala con `soloDati`.
 */
export async function apriArchivioDaFile(): Promise<{
  ok: boolean
  messaggio: string
  utenti?: number
  immobili?: number
  soloDati?: boolean
}> {
  try {
    const [handle] = await window.showOpenFilePicker!({
      types: [
        {
          description: 'Archivio o dati TR.A.V.I.',
          accept: { 'application/json': ['.travidb', '.travidati', '.json'] },
        },
      ],
    })
    if (!handle) return { ok: false, messaggio: '' }
    const testo = await (await handle.getFile()).text()
    let dump: {
      formato?: string
      utenti?: UtenteArchivio[]
      immobili?: Immobile[]
      preferenze?: { k: string; v: string }[]
      // negli archivi completi gli incarichi hanno l'id dell'immobile,
      // nei file di soli dati hanno il numero asset
      bm?: unknown[]
      documenti?: unknown[]
    }
    try {
      dump = JSON.parse(testo)
    } catch {
      throw new Error('Il file non è un archivio TR.A.V.I. valido.')
    }
    // file di soli dati: non è un archivio (non contiene utenti), ma i suoi
    // immobili si possono caricare lo stesso senza toccare gli account
    if (dump.formato === FORMATO_ESPORTAZIONE && Array.isArray(dump.immobili)) {
      const importati = await sostituisciImmobili(
        dump.immobili as ImmobileInput[],
        dump.bm as BMEsportato[] | undefined,
      )
      return {
        ok: true,
        soloDati: true,
        immobili: importati,
        messaggio: `"${handle.name}" contiene solo dati (nessun utente): importati ${importati} immobili. Utenti e password restano i tuoi.`,
      }
    }
    if (dump.formato !== FORMATO_ARCHIVIO || !Array.isArray(dump.utenti)) {
      throw new Error('Il file non è un archivio TR.A.V.I. valido.')
    }
    inSincronizzazione = true
    try {
      await svuota('utenti')
      await svuota('immobili')
      await svuota('preferenze')
      await svuota('bm')
      for (const u of dump.utenti) await metti('utenti', u)
      for (const i of dump.immobili ?? []) await metti('immobili', i)
      for (const p of dump.preferenze ?? []) await metti('preferenze', p)
      for (const b of (dump.bm ?? []) as IncaricoBM[]) await metti('bm', b)
      for (const d of (dump.documenti ?? []) as Documento[]) await metti('documenti', d)
      await metti('meta', { k: 'fileArchivio', h: handle })
      await metti('meta', {
        k: 'ultimoSalvataggioFile',
        v: String((dump as { salvato_il?: string }).salvato_il || new Date().toISOString()),
      })
    } finally {
      inSincronizzazione = false
    }
    scriviSessione(null) // si rientra con le credenziali contenute nell'archivio
    return {
      ok: true,
      messaggio: `Archivio "${handle.name}" caricato.`,
      utenti: dump.utenti.length,
      immobili: (dump.immobili ?? []).length,
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, messaggio: '' }
    return { ok: false, messaggio: String((e as Error)?.message ?? e) }
  }
}

/**
 * Nuovo archivio: azzera i dati e li salva in un file nuovo. Gli UTENTI vengono
 * mantenuti e travasati nel nuovo file (altrimenti non si potrebbe più entrare).
 * Prima dell'azzeramento viene scaricata una copia di sicurezza dei dati.
 */
export async function creaNuovoArchivio(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    if (!window.showDirectoryPicker) {
      return { ok: false, messaggio: 'Questo browser non permette di scegliere una cartella: usa Edge o Chrome.' }
    }
    const cartella = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' })
    if (!(await permessoScrittura(cartella, true))) {
      return { ok: false, messaggio: 'Permesso di scrittura negato sulla cartella scelta.' }
    }
    await metti('meta', { k: 'cartellaArchivio', h: cartella })

    // copia di sicurezza dello stato attuale, prima di azzerare
    const { testo } = await generaDump()
    const copia = await scriviBackup(testo, 'prima-del-nuovo-archivio')
    // e copia anche dell'archivio che eventualmente si trovava già lì
    try {
      const vecchio = await cartella.getFileHandle(NOME_ARCHIVIO)
      await scriviBackup(await (await vecchio.getFile()).text(), 'archivio-sostituito')
    } catch {
      /* nessun archivio precedente in questa cartella */
    }

    const file = await cartella.getFileHandle(NOME_ARCHIVIO, { create: true })
    inSincronizzazione = true
    try {
      await svuota('immobili')
      await svuota('preferenze')
      await svuota('bm')
      await svuota('documenti')
      await metti('meta', { k: 'fileArchivio', h: file })
    } finally {
      inSincronizzazione = false
    }
    const scritto = await specchiaOra(true)
    try {
      window.dispatchEvent(new CustomEvent('travi-archivio-importato'))
    } catch {
      /* ignora */
    }
    return scritto
      ? {
          ok: true,
          messaggio: `Nuovo archivio creato in ${cartella.name}\\${NOME_ARCHIVIO}. Utenti mantenuti, dati azzerati.${copia ? ` Copia di sicurezza: ${CARTELLA_BACKUP}\\${copia}.` : ''}`,
        }
      : { ok: false, messaggio: 'Archivio azzerato ma scrittura del file non riuscita: usa "Salva ora".' }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, messaggio: '' }
    return { ok: false, messaggio: String((e as Error)?.message ?? e) }
  }
}

/** Scarica una copia dell'archivio completo, da inviare a un collega. */
export async function esportaCopiaArchivio(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const { testo } = await generaDump()
    const nome = `TRAVI-archivio-copia-${new Date().toISOString().slice(0, 10)}.travidb`
    scaricaFile(nome, testo)
    return { ok: true, messaggio: `Copia dell'archivio scaricata: ${nome} (cartella Download).` }
  } catch (e) {
    return { ok: false, messaggio: String((e as Error)?.message ?? e) }
  }
}

/**
 * Importa i DATI da un archivio ricevuto (copia di un collega): sostituisce gli
 * immobili, ma MANTIENE gli utenti e le preferenze di questo computer, così si
 * continua a entrare con le proprie credenziali. Accetta anche i file .travidati.
 */
export async function importaDatiDaArchivio(): Promise<{ ok: boolean; messaggio: string; immobili?: number }> {
  try {
    const [handle] = await window.showOpenFilePicker!({
      types: [
        {
          description: 'Archivio o dati TR.A.V.I.',
          accept: { 'application/json': ['.travidb', '.travidati', '.json'] },
        },
      ],
    })
    if (!handle) return { ok: false, messaggio: '' }
    let dump: { formato?: string; immobili?: ImmobileInput[]; bm?: unknown[] }
    try {
      dump = JSON.parse(await (await handle.getFile()).text())
    } catch {
      throw new Error('Il file non è un archivio TR.A.V.I. valido.')
    }
    const formatoValido = dump?.formato === FORMATO_ARCHIVIO || dump?.formato === FORMATO_ESPORTAZIONE
    if (!formatoValido || !Array.isArray(dump.immobili)) {
      throw new Error('Il file non è un archivio TR.A.V.I. valido.')
    }
    // solo dai file di soli dati gli incarichi arrivano agganciati all'asset
    const incarichi = dump.formato === FORMATO_ESPORTAZIONE ? (dump.bm as BMEsportato[] | undefined) : undefined
    const importati = await sostituisciImmobili(dump.immobili, incarichi)
    return { ok: true, messaggio: `Importati ${importati} immobili. I tuoi utenti restano invariati.`, immobili: importati }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, messaggio: '' }
    return { ok: false, messaggio: String((e as Error)?.message ?? e) }
  }
}

/**
 * Salvataggio richiesto dall'utente: scrive l'archivio e ne mette una copia
 * datata nella sottocartella "backup", accanto all'archivio stesso (la cartella
 * viene creata se non c'è). Il salvataggio automatico, invece, non fa copie.
 */
export async function salvaArchivioOra(): Promise<{ ok: boolean; messaggio: string }> {
  const scritto = await specchiaOra(true)
  if (!scritto) {
    return { ok: false, messaggio: 'Salvataggio non riuscito: nessun archivio in uso o permesso negato.' }
  }
  const { testo } = await generaDump()
  const copia = await scriviBackup(testo, 'backup')
  return {
    ok: true,
    messaggio: copia
      ? `Archivio salvato, con copia in ${CARTELLA_BACKUP}\\${copia}.`
      : 'Archivio salvato. Per avere anche le copie di sicurezza imposta la posizione con «Scegli la posizione dell\'archivio».',
  }
}

export async function scollegaFileArchivio(): Promise<void> {
  try {
    await togli('meta', 'fileArchivio')
    await togli('meta', 'ultimoSalvataggioFile')
  } catch {
    /* ignora */
  }
}

// ---------------------------------------------------------------- password

type UtenteArchivio = Utente & { pwd_hash: string; pwd_salt: string }

function esadecimale(b: ArrayBuffer): string {
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
}

async function calcolaHash(password: string, saltHex: string): Promise<string> {
  const sale = new Uint8Array(saltHex.match(/.{2}/g)!.map((x) => parseInt(x, 16)))
  const chiave = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bit = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sale, iterations: 310000 },
    chiave,
    256,
  )
  return esadecimale(bit)
}

function nuovoSale(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return esadecimale(b.buffer)
}

function validaPassword(p: string): string {
  if (String(p || '').length < 8) throw new Error('La password deve avere almeno 8 caratteri.')
  return String(p)
}

function validaEmail(e: string): string {
  const mail = String(e || '').trim().toLowerCase()
  if (!mail) throw new Error("L'indirizzo email (nome utente) è obbligatorio.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('Indirizzo email non valido.')
  return mail
}

function ePermanente(email: string | null | undefined): boolean {
  return String(email || '').trim().toLowerCase() === ADMIN_PERMANENTE
}

// ---------------------------------------------------------------- sessione

function leggiSessione(): { id: string } | null {
  try {
    const raw = sessionStorage.getItem(CHIAVE_SESSIONE)
    return raw ? (JSON.parse(raw) as { id: string }) : null
  } catch {
    return null
  }
}

function scriviSessione(s: { id: string } | null): void {
  try {
    if (s) sessionStorage.setItem(CHIAVE_SESSIONE, JSON.stringify(s))
    else sessionStorage.removeItem(CHIAVE_SESSIONE)
  } catch {
    /* ignora */
  }
}

function pubblico(u: UtenteArchivio): Utente {
  return {
    id: u.id,
    nome: u.nome,
    cognome: u.cognome,
    email: u.email,
    ruolo: u.ruolo,
    attivo: u.attivo,
    creato_il: u.creato_il,
    permanente: ePermanente(u.email),
  }
}

async function utenteCorrente(): Promise<UtenteArchivio | null> {
  const s = leggiSessione()
  if (!s) return null
  const elenco = await tutti<UtenteArchivio>('utenti')
  return elenco.find((u) => u.id === s.id) ?? null
}

async function richiediSessione(): Promise<UtenteArchivio> {
  const u = await utenteCorrente()
  if (!u) throw new Error('Sessione non attiva: effettua il login.')
  return u
}

async function richiediAdmin(): Promise<UtenteArchivio> {
  const u = await richiediSessione()
  if (u.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
  return u
}

// ---------------------------------------------------------------- utilità

function pulisci(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

async function rispondi<T>(fn: () => Promise<T>): Promise<RispostaDb<T>> {
  try {
    return { data: await fn(), error: null }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    return { data: null, error: { code: /già presente|gia presente/i.test(msg) ? '23505' : undefined, message: msg } }
  }
}

function scaricaFile(nome: string, contenuto: string): void {
  const blob = new Blob([contenuto], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// -------------------------------------------------- Building Management (dati)

/** Incarico come viaggia nei file di soli dati: agganciato all'asset, non all'id. */
type BMEsportato = Partial<DatiBM> & { asset?: string; anno?: number }

/** Incarichi pronti per un file di soli dati: al posto dell'id c'è l'asset. */
async function bmPerEsportazione(): Promise<BMEsportato[]> {
  const [incarichi, immobili] = await Promise.all([tutti<IncaricoBM>('bm'), tutti<Immobile>('immobili')])
  const assetPerId = new Map(immobili.map((i) => [i.id, i.asset]))
  return incarichi
    .filter((r) => assetPerId.has(r.immobile_id))
    .map(({ id: _id, immobile_id, aggiornato_il: _agg, ...resto }) => ({
      ...resto,
      asset: assetPerId.get(immobile_id) as string,
    }))
}

/** Mette in forma i campi dell'incarico: dodici mesi, sei bimestri, niente sorprese. */
function normalizzaBM(campi: Partial<DatiBM>): DatiBM {
  const base = datiBMVuoti()
  const report = Array.isArray(campi.report) ? campi.report : base.report
  const bimestri = Array.isArray(campi.bimestri) ? campi.bimestri : base.bimestri
  const l = campi.lettera
  return {
    lettera: l
      ? {
          nomeFile: pulisci(l.nomeFile),
          caricataIl: pulisci(l.caricataIl),
          fornitoreIndirizzo: pulisci(l.fornitoreIndirizzo),
          accordoData: pulisci(l.accordoData),
          accordoNome: pulisci(l.accordoNome),
          tipoAttivazione: pulisci(l.tipoAttivazione),
          codiceFiscaleBM: pulisci(l.codiceFiscaleBM),
          importo: numeroOppureNulla(l.importo),
          compendi: Array.isArray(l.compendi) ? l.compendi.map((c) => String(c)) : [],
          documentoId: pulisci(l.documentoId),
          allegati: Array.isArray(l.allegati) ? (l.allegati as AllegatoBM[]) : [],
        }
      : null,
    fornitore: pulisci(campi.fornitore),
    nominativo: pulisci(campi.nominativo),
    recapito: pulisci(campi.recapito),
    categoria: pulisci(campi.categoria),
    periodo_dal: pulisci(campi.periodo_dal),
    periodo_al: pulisci(campi.periodo_al),
    fabbisogno: numeroOppureNulla(campi.fabbisogno),
    call_off: pulisci(campi.call_off),
    // i vecchi archivi tenevano una spunta per mese: vale come un report
    report: Array.from({ length: 12 }, (_, i) => {
      const v = report[i] as unknown
      if (typeof v === 'boolean') return v ? 1 : 0
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? Math.min(9, Math.round(n)) : 0
    }),
    reportAttesi: numeroOppureNulla(campi.reportAttesi),
    bimestri: BIMESTRI.map((_, i) => {
      const b = bimestri[i] ?? bimestreVuoto()
      return {
        idBem: pulisci(b?.idBem),
        importo: numeroOppureNulla(b?.importo),
        allegati: pulisci(b?.allegati),
        autorizzazione: pulisci(b?.autorizzazione),
      }
    }),
    sds1: pulisci(campi.sds1),
    sds2: pulisci(campi.sds2),
    svincolo_id: pulisci(campi.svincolo_id),
    svincolo_aut: pulisci(campi.svincolo_aut),
    note: pulisci(campi.note),
  }
}

function numeroOppureNulla(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function sonoCoordinate(q: string): boolean {
  return /^-?\d{1,3}([.,]\d+)?\s*[,;]\s*-?\d{1,3}([.,]\d+)?$/.test(String(q).trim())
}

function urlMappaEsterna(q: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function urlMappaIncorporata(q: string, tipo: 'mappa' | 'streetview'): string {
  const punto = sonoCoordinate(q) ? q.replace(/;/, ',').replace(/\s+/g, '') : q
  if (tipo === 'streetview') {
    const cb = sonoCoordinate(q) ? `&cbll=${encodeURIComponent(punto)}` : ''
    return `https://maps.google.com/maps?q=${encodeURIComponent(punto)}&layer=c${cb}&cbp=11,0,0,0,0&hl=it&output=embed`
  }
  const p = sonoCoordinate(q) ? `loc:${punto}` : q
  return `https://maps.google.com/maps?q=${encodeURIComponent(p)}&hl=it&z=16&ie=UTF8&iwloc=B&output=embed`
}

// pacchetto in attesa di conferma per l'importazione
let importInAttesa: { immobili: ImmobileInput[]; bm?: BMEsportato[]; nome: string } | null = null

// ---------------------------------------------------------------- interfaccia

export function creaApiBrowser(): ApiTravi {
  // archiviazione persistente: riduce il rischio che il browser la ripulisca
  try {
    void navigator.storage?.persist?.()
  } catch {
    /* non disponibile: pazienza */
  }
  try {
    agganciaRiallineamento()
    agganciaAggiornamentoWeb()
  } catch {
    /* ignora */
  }

  return {
    auth: {
      stato: () =>
        rispondi(async () => {
          // all'avvio, se il permesso sul file è già attivo, ci si riallinea
          // in silenzio: aprendo un altro browser i dati appaiono aggiornati
          await sincronizzaDaFile(false)
          const utenti = await tutti<UtenteArchivio>('utenti')
          const attuale = await utenteCorrente()
          return { serveSetup: utenti.length === 0, utente: attuale ? pubblico(attuale) : null }
        }),

      setup: (r: NuovoUtente) =>
        rispondi(async () => {
          const utenti = await tutti<UtenteArchivio>('utenti')
          if (utenti.length > 0) throw new Error('Esiste già almeno un utente: usa il login.')
          const mail = validaEmail(r.email)
          const pwd = validaPassword(r.password)
          const salt = nuovoSale()
          const nuovo: UtenteArchivio = {
            id: crypto.randomUUID(),
            nome: pulisci(r.nome),
            cognome: pulisci(r.cognome),
            email: mail,
            ruolo: 'admin',
            attivo: true,
            creato_il: new Date().toISOString(),
            permanente: ePermanente(mail),
            pwd_hash: await calcolaHash(pwd, salt),
            pwd_salt: salt,
          }
          await metti('utenti', nuovo)
          scriviSessione({ id: nuovo.id })
          return pubblico(nuovo)
        }),

      login: (email: string, password: string) =>
        rispondi(async () => {
          // il click di accesso è un gesto dell'utente: se serve, il browser
          // mostra la richiesta di permesso sul file e ci si riallinea PRIMA
          // di verificare le credenziali (che potrebbero essere cambiate altrove)
          await sincronizzaDaFile(true)
          const mail = String(email || '').trim().toLowerCase()
          const utenti = await tutti<UtenteArchivio>('utenti')
          const u = utenti.find((x) => x.email.toLowerCase() === mail)
          if (!u || (await calcolaHash(password || '', u.pwd_salt)) !== u.pwd_hash) {
            throw new Error('Nome utente o password non corretti.')
          }
          if (!u.attivo) throw new Error('Utente disattivato: contatta un amministratore.')
          scriviSessione({ id: u.id })
          // il click di accesso è il momento giusto per rinnovare il permesso
          // sul file dell'archivio (se il browser lo richiede) e riallinearlo
          void specchiaOra(true)
          return pubblico(u)
        }),

      logout: () =>
        rispondi(async () => {
          scriviSessione(null)
          return null
        }),

      cambiaPassword: (vecchia: string, nuova: string) =>
        rispondi(async () => {
          const u = await richiediSessione()
          if ((await calcolaHash(vecchia || '', u.pwd_salt)) !== u.pwd_hash) {
            throw new Error('La password attuale non è corretta.')
          }
          const pwd = validaPassword(nuova)
          const salt = nuovoSale()
          await metti('utenti', { ...u, pwd_hash: await calcolaHash(pwd, salt), pwd_salt: salt })
          return null
        }),
    },

    utenti: {
      list: () =>
        rispondi(async () => {
          await richiediAdmin()
          const elenco = await tutti<UtenteArchivio>('utenti')
          return elenco
            .map(pubblico)
            .sort((a, b) =>
              `${a.cognome ?? ''}${a.nome ?? ''}`.localeCompare(`${b.cognome ?? ''}${b.nome ?? ''}`, 'it'),
            )
        }),

      insert: (r: NuovoUtente) =>
        rispondi(async () => {
          await richiediAdmin()
          const mail = validaEmail(r.email)
          const utenti = await tutti<UtenteArchivio>('utenti')
          if (utenti.some((u) => u.email.toLowerCase() === mail)) {
            throw new Error('Email già presente.')
          }
          const pwd = validaPassword(r.password)
          const salt = nuovoSale()
          await metti('utenti', {
            id: crypto.randomUUID(),
            nome: pulisci(r.nome),
            cognome: pulisci(r.cognome),
            email: mail,
            ruolo: ePermanente(mail) || r.ruolo === 'admin' ? 'admin' : 'utente',
            attivo: true,
            creato_il: new Date().toISOString(),
            pwd_hash: await calcolaHash(pwd, salt),
            pwd_salt: salt,
          } satisfies UtenteArchivio)
          return null
        }),

      update: (id: string, campi: Partial<Utente>) =>
        rispondi(async () => {
          const s = await richiediSessione()
          if (s.id !== id && s.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
          const utenti = await tutti<UtenteArchivio>('utenti')
          const attuale = utenti.find((u) => u.id === id)
          if (!attuale) throw new Error('Utente non trovato.')
          const mail = validaEmail(campi.email ?? attuale.email)
          if (utenti.some((u) => u.id !== id && u.email.toLowerCase() === mail)) {
            throw new Error('Email già presente.')
          }
          let ruolo = s.ruolo === 'admin' && campi.ruolo ? (campi.ruolo === 'admin' ? 'admin' : 'utente') : attuale.ruolo
          if (ePermanente(attuale.email)) {
            if (mail !== attuale.email.toLowerCase()) {
              throw new Error("L'amministratore permanente non può cambiare indirizzo email.")
            }
            ruolo = 'admin'
          }
          if (ruolo === 'utente' && attuale.ruolo === 'admin') {
            const altriAdmin = utenti.filter((u) => u.id !== id && u.ruolo === 'admin').length
            if (altriAdmin === 0) throw new Error('Deve restare almeno un amministratore.')
          }
          await metti('utenti', {
            ...attuale,
            nome: pulisci(campi.nome ?? attuale.nome),
            cognome: pulisci(campi.cognome ?? attuale.cognome),
            email: mail,
            ruolo,
          })
          return null
        }),

      resetPassword: (id: string, nuova: string) =>
        rispondi(async () => {
          const s = await richiediAdmin()
          const utenti = await tutti<UtenteArchivio>('utenti')
          const bersaglio = utenti.find((u) => u.id === id)
          if (!bersaglio) throw new Error('Utente non trovato.')
          if (ePermanente(bersaglio.email) && s.id !== id) {
            throw new Error("Solo l'amministratore permanente può cambiare la propria password.")
          }
          const pwd = validaPassword(nuova)
          const salt = nuovoSale()
          await metti('utenti', { ...bersaglio, pwd_hash: await calcolaHash(pwd, salt), pwd_salt: salt })
          return null
        }),

      remove: (id: string) =>
        rispondi(async () => {
          const s = await richiediAdmin()
          if (s.id === id) throw new Error('Non puoi eliminare te stesso.')
          const utenti = await tutti<UtenteArchivio>('utenti')
          const bersaglio = utenti.find((u) => u.id === id)
          if (!bersaglio) throw new Error('Utente non trovato.')
          if (ePermanente(bersaglio.email)) {
            throw new Error("Questo è l'amministratore permanente: non può essere eliminato.")
          }
          if (bersaglio.ruolo === 'admin') {
            const altriAdmin = utenti.filter((u) => u.id !== id && u.ruolo === 'admin').length
            if (altriAdmin === 0) throw new Error('Deve restare almeno un amministratore.')
          }
          await togli('utenti', id)
          return null
        }),
    },

    preferenze: {
      tutte: () =>
        rispondi(async () => {
          const s = await richiediSessione()
          const righe = await tutti<{ k: string; v: string }>('preferenze')
          const mie: Record<string, string> = {}
          for (const r of righe) {
            if (r.k.startsWith(`${s.id}|`)) mie[r.k.slice(s.id.length + 1)] = r.v
          }
          return mie
        }),
      imposta: (chiave: string, valore: string | null) =>
        rispondi(async () => {
          const s = await richiediSessione()
          const k = `${s.id}|${chiave}`
          if (valore === null || valore === undefined) await togli('preferenze', k)
          else await metti('preferenze', { k, v: String(valore) })
          return null
        }),
    },

    immobili: {
      list: () =>
        rispondi(async () => {
          await richiediSessione()
          return tutti<Immobile>('immobili')
        }),
      insert: (r: ImmobileInput) =>
        rispondi(async () => {
          await richiediSessione()
          const asset = pulisci(r.asset)
          const den = pulisci(r.denominazione)
          if (!asset || !den) throw new Error('Asset e Denominazione sono obbligatori.')
          const elenco = await tutti<Immobile>('immobili')
          if (
            elenco.some(
              (i) =>
                i.asset.toLowerCase() === asset.toLowerCase() ||
                i.denominazione.toLowerCase() === den.toLowerCase(),
            )
          ) {
            throw new Error('Asset o Denominazione già presenti.')
          }
          const localizzazione = pulisci(r.localizzazione)
          await metti('immobili', {
            id: crypto.randomUUID(),
            asset,
            denominazione: den,
            portafoglio: pulisci(r.portafoglio),
            localizzazione,
            // se non la si scrive, la regione viene proposta dall'indirizzo
            regione: pulisci(r.regione) ?? regioneDaLocalizzazione(localizzazione),
            creato_il: new Date().toISOString(),
          } satisfies Immobile)
          return null
        }),
      update: (id: string, r: ImmobileInput) =>
        rispondi(async () => {
          await richiediSessione()
          const asset = pulisci(r.asset)
          const den = pulisci(r.denominazione)
          if (!asset || !den) throw new Error('Asset e Denominazione sono obbligatori.')
          const elenco = await tutti<Immobile>('immobili')
          const attuale = elenco.find((i) => i.id === id)
          if (!attuale) throw new Error('Immobile non trovato.')
          if (
            elenco.some(
              (i) =>
                i.id !== id &&
                (i.asset.toLowerCase() === asset.toLowerCase() ||
                  i.denominazione.toLowerCase() === den.toLowerCase()),
            )
          ) {
            throw new Error('Asset o Denominazione già presenti.')
          }
          const localizzazione = pulisci(r.localizzazione)
          await metti('immobili', {
            ...attuale,
            asset,
            denominazione: den,
            portafoglio: pulisci(r.portafoglio),
            localizzazione,
            // la regione scritta a mano non viene mai ricalcolata da sola
            regione:
              r.regione !== undefined
                ? pulisci(r.regione)
                : (attuale.regione ?? regioneDaLocalizzazione(localizzazione)),
          })
          return null
        }),
      remove: (id: string) =>
        rispondi(async () => {
          await richiediSessione()
          await togli('immobili', id)
          return null
        }),
    },

    database: {
      esporta: () =>
        rispondi(async () => {
          const s = await richiediSessione()
          const immobili = (await tutti<Immobile>('immobili'))
            .map((i) => ({
              asset: i.asset,
              denominazione: i.denominazione,
              portafoglio: i.portafoglio,
              localizzazione: i.localizzazione,
              regione: i.regione ?? null,
            }))
            .sort((a, b) => a.asset.localeCompare(b.asset, 'it', { numeric: true }))
          const nome = `TRAVI-dati-${new Date().toISOString().slice(0, 10)}.travidati`
          scaricaFile(
            nome,
            JSON.stringify(
              {
                formato: FORMATO_ESPORTAZIONE,
                versione_app: __APP_VERSION__,
                esportato_il: new Date().toISOString(),
                esportato_da: s.email,
                immobili,
                bm: await bmPerEsportazione(),
              },
              null,
              1,
            ),
          )
          return { percorso: `Download → ${nome}`, immobili: immobili.length }
        }),

      verificaImport: () =>
        rispondi(async () => {
          await richiediSessione()
          const file = await new Promise<File | null>((risolvi) => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.travidati,.json'
            input.onchange = () => risolvi(input.files?.[0] ?? null)
            input.click()
          })
          if (!file) return null
          let pacchetto: {
            formato?: string
            versione_app?: string
            esportato_da?: string
            esportato_il?: string
            immobili?: ImmobileInput[]
            bm?: BMEsportato[]
          }
          try {
            pacchetto = JSON.parse(await file.text())
          } catch {
            throw new Error("Il file non è un'esportazione TR.A.V.I. valida.")
          }
          if (!pacchetto || pacchetto.formato !== FORMATO_ESPORTAZIONE || !Array.isArray(pacchetto.immobili)) {
            throw new Error("Il file non è un'esportazione TR.A.V.I. valida.")
          }
          importInAttesa = { immobili: pacchetto.immobili, bm: pacchetto.bm, nome: file.name }
          const attuali = await tutti<Immobile>('immobili')
          return {
            percorso: file.name,
            versione: String(pacchetto.versione_app || ''),
            immobili: pacchetto.immobili.length,
            esportatoDa: String(pacchetto.esportato_da || ''),
            esportatoIl: String(pacchetto.esportato_il || ''),
            immobiliAttuali: attuali.length,
          } satisfies AnteprimaImport
        }),

      applicaImport: () =>
        rispondi(async () => {
          const s = await richiediSessione()
          if (!importInAttesa) throw new Error('Nessun file in attesa di importazione.')
          // copia di sicurezza automatica dei dati attuali (file scaricato)
          const attuali = await tutti<Immobile>('immobili')
          const nomeBackup = `TRAVI-backup-prima-import-${new Date().toISOString().slice(0, 10)}.travidati`
          try {
            scaricaFile(
              nomeBackup,
              JSON.stringify(
                {
                  formato: FORMATO_ESPORTAZIONE,
                  versione_app: __APP_VERSION__,
                  esportato_il: new Date().toISOString(),
                  esportato_da: s.email,
                  immobili: attuali.map((i) => ({
                    asset: i.asset,
                    denominazione: i.denominazione,
                    portafoglio: i.portafoglio,
                    localizzazione: i.localizzazione,
                    regione: i.regione ?? null,
                  })),
                },
                null,
                1,
              ),
            )
          } catch {
            /* il backup è una cortesia: non blocca l'importazione */
          }
          const importati = await sostituisciImmobili(importInAttesa.immobili, importInAttesa.bm)
          importInAttesa = null
          return { copiaSicurezza: `Download → ${nomeBackup}`, immobili: importati }
        }),
    },

    bm: {
      get: (immobileId: string, anno: number) =>
        rispondi(async () => {
          await richiediSessione()
          const righe = await tutti<IncaricoBM>('bm')
          return righe.find((r) => r.immobile_id === immobileId && Number(r.anno) === Number(anno)) ?? null
        }),
      salva: (immobileId: string, anno: number, campi: DatiBM) =>
        rispondi(async () => {
          await richiediSessione()
          if (!immobileId) throw new Error('Immobile non indicato.')
          const a = Number(anno)
          if (!Number.isFinite(a)) throw new Error('Anno non valido.')
          const righe = await tutti<IncaricoBM>('bm')
          const esistente = righe.find((r) => r.immobile_id === immobileId && Number(r.anno) === a)
          await metti('bm', {
            ...normalizzaBM(campi),
            id: esistente?.id ?? crypto.randomUUID(),
            immobile_id: immobileId,
            anno: a,
            aggiornato_il: new Date().toISOString(),
          } satisfies IncaricoBM)
          return null
        }),
      anni: (immobileId: string) =>
        rispondi(async () => {
          await richiediSessione()
          const righe = await tutti<IncaricoBM>('bm')
          return righe
            .filter((r) => r.immobile_id === immobileId)
            .map((r) => Number(r.anno))
            .filter((n) => Number.isFinite(n))
            .sort((a, b) => b - a)
        }),
      fornitori: () =>
        rispondi(async () => {
          await richiediSessione()
          const righe = await tutti<IncaricoBM>('bm')
          const nomi = new Set(righe.map((r) => (r.fornitore ?? '').trim()).filter(Boolean))
          return [...nomi].sort((a, b) => a.localeCompare(b, 'it'))
        }),
      tutti: () =>
        rispondi(async () => {
          await richiediSessione()
          return tutti<IncaricoBM>('bm')
        }),
      pulisciSenzaLettera: () =>
        rispondi(async () => {
          await richiediSessione()
          // senza lettera un incarico non ha ragione di esistere: i dati veri
          // arrivano dai documenti, non più dal foglio di monitoraggio
          const righe = await tutti<IncaricoBM>('bm')
          let tolti = 0
          for (const r of righe) {
            if (r.lettera) continue
            await togli('bm', r.id)
            tolti++
          }
          return tolti
        }),
      rimuovi: (immobileId: string, anno: number) =>
        rispondi(async () => {
          await richiediSessione()
          const righe = await tutti<IncaricoBM>('bm')
          const esistente = righe.find((r) => r.immobile_id === immobileId && Number(r.anno) === Number(anno))
          if (esistente) await togli('bm', esistente.id)
          return null
        }),
    },

    documenti: {
      salva: (d: { nome: string; tipo: string; contenuto: string; dimensione: number }) =>
        rispondi(async () => {
          await richiediSessione()
          const id = crypto.randomUUID()
          await metti('documenti', {
            id,
            nome: String(d.nome || 'documento'),
            tipo: String(d.tipo || 'application/pdf'),
            dimensione: Number(d.dimensione) || 0,
            caricato_il: new Date().toISOString(),
            contenuto: String(d.contenuto || ''),
          } satisfies Documento)
          return id
        }),
      apri: (id: string) =>
        rispondi(async () => {
          await richiediSessione()
          const tuttiDoc = await tutti<Documento>('documenti')
          return tuttiDoc.find((d) => d.id === id) ?? null
        }),
      pulisci: () =>
        rispondi(async () => {
          await richiediSessione()
          // si tengono solo i file ancora richiamati da qualche incarico
          const incarichi = await tutti<IncaricoBM>('bm')
          const usati = new Set<string>()
          for (const i of incarichi) {
            if (i.lettera?.documentoId) usati.add(i.lettera.documentoId)
            for (const a of i.lettera?.allegati ?? []) usati.add(a.documentoId)
          }
          const tuttiDoc = await tutti<Documento>('documenti')
          let tolti = 0
          for (const d of tuttiDoc) {
            if (usati.has(d.id)) continue
            await togli('documenti', d.id)
            tolti++
          }
          return tolti
        }),
    },

    mappa: {
      apri: (query: string) =>
        rispondi(async () => {
          await richiediSessione()
          const q = String(query || '').trim()
          if (!q) throw new Error('Localizzazione non indicata.')
          window.open(urlMappaEsterna(q), '_blank', 'noopener')
          return null
        }),
      anteprima: (query: string, tipo: 'mappa' | 'streetview') =>
        rispondi(async () => {
          await richiediSessione()
          const q = String(query || '').trim()
          if (!q) throw new Error('Localizzazione non indicata.')
          return urlMappaIncorporata(q, tipo)
        }),
    },

    sistemazione: {
      stato: () => rispondi(async () => ({ serve: false, posizioneAttuale: '', destinazione: '' })),
      esegui: () => rispondi(async () => ({ destinazione: '' })),
      rifiuta: () => rispondi(async () => null),
    },

    collegamenti: {
      stato: () => rispondi(async () => ({ desktop: false, menuAvvio: false, giaChiesto: true })),
      crea: () =>
        rispondi<{ fatti: string[] }>(async () => {
          throw new Error(
            'Nel browser il collegamento si crea dal menu del browser: ⋯ → App → "Installa questo sito come app".',
          )
        }),
      rimanda: () => rispondi(async () => null),
      mostraCartella: () =>
        rispondi<null>(async () => {
          throw new Error('Non disponibile nella versione browser.')
        }),
    },

    aggiornamenti: {
      stato: () =>
        rispondi<StatoAggiornamento>(async () => ({
          supportato: false,
          versioneCorrente: __APP_VERSION__,
          fase: 'inattivo',
          percentuale: 0,
          disponibile: null,
          messaggio: '',
        })),
      // il pulsante della versione: se in rete c'è una versione nuova, ricarica
      // con l'indirizzo "sporcato" che scavalca qualsiasi cache
      controlla: () =>
        rispondi(async () => {
          const v = await versioneInRete()
          if (v && v !== __APP_VERSION__) {
            window.location.replace(urlConVersione(v))
          }
          return null
        }),
      installa: () =>
        rispondi<null>(async () => {
          throw new Error('Nella versione browser gli aggiornamenti arrivano ricaricando la pagina.')
        }),
      osserva: () => () => {},
    },

    versione: async () => __APP_VERSION__,
  }
}
