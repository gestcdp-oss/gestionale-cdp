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
import type { Immobile } from './tipi'

const ADMIN_PERMANENTE = 'marabelli.s@gmail.com'
const FORMATO_ESPORTAZIONE = 'travi-dati-1'
const FORMATO_ARCHIVIO = 'travi-archivio-1'
const CHIAVE_SESSIONE = 'travi_sessione'

// --- accesso ai file del computer (Edge/Chrome): dichiarazioni minime ---
type PermessoFile = 'granted' | 'denied' | 'prompt'
interface HandleFile {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermessoFile>
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermessoFile>
}
declare global {
  interface Window {
    showSaveFilePicker?: (opzioni?: unknown) => Promise<HandleFile>
    showOpenFilePicker?: (opzioni?: unknown) => Promise<HandleFile[]>
  }
}

// ---------------------------------------------------------------- IndexedDB

const NOME_DB = 'travi'

function apriIdb(): Promise<IDBDatabase> {
  return new Promise((risolvi, rifiuta) => {
    const ric = indexedDB.open(NOME_DB, 1)
    ric.onupgradeneeded = () => {
      const db = ric.result
      if (!db.objectStoreNames.contains('utenti')) db.createObjectStore('utenti', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('immobili')) db.createObjectStore('immobili', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('preferenze')) db.createObjectStore('preferenze', { keyPath: 'k' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' })
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

async function generaDump(): Promise<{ testo: string; salvatoIl: string }> {
  const [utenti, immobili, preferenze] = await Promise.all([
    tutti<UtenteArchivio>('utenti'),
    tutti<Immobile>('immobili'),
    tutti<{ k: string; v: string }>('preferenze'),
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
    let permesso: PermessoFile = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt'
    if (permesso === 'prompt' && conRichiesta) {
      permesso = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied'
    }
    if (permesso !== 'granted') return false
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
    let permesso: PermessoFile = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt'
    if (permesso === 'prompt' && conRichiesta) {
      permesso = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied'
    }
    if (permesso !== 'granted') return 'niente'

    const testo = await (await handle.getFile()).text()
    let dump: {
      formato?: string
      salvato_il?: string
      utenti?: UtenteArchivio[]
      immobili?: Immobile[]
      preferenze?: { k: string; v: string }[]
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
      for (const u of dump.utenti) await metti('utenti', u)
      for (const i of dump.immobili ?? []) await metti('immobili', i)
      for (const p of dump.preferenze ?? []) await metti('preferenze', p)
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
  ultimoSalvataggio: string
  permesso: PermessoFile | 'n/d'
}

export async function statoArchivioFile(): Promise<StatoArchivioFile> {
  if (!supportaArchivioFile()) {
    return { supportato: false, collegato: false, nomeFile: '', ultimoSalvataggio: '', permesso: 'n/d' }
  }
  const handle = await leggiHandle()
  const ultimo = await prendiMeta('ultimoSalvataggioFile')
  return {
    supportato: true,
    collegato: Boolean(handle),
    nomeFile: handle?.name ?? '',
    ultimoSalvataggio: String(ultimo?.v ?? ''),
    permesso: handle ? ((await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt') : 'n/d',
  }
}

/** Crea (o sceglie) il file dell'archivio e ci salva subito tutto. */
export async function creaFileArchivio(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const handle = await window.showSaveFilePicker!({
      suggestedName: 'TRAVI-archivio.travidb',
      startIn: 'documents',
      types: [{ description: 'Archivio TR.A.V.I.', accept: { 'application/json': ['.travidb'] } }],
    })
    await metti('meta', { k: 'fileArchivio', h: handle })
    const scritto = await specchiaOra(true)
    return scritto
      ? { ok: true, messaggio: `Archivio collegato: ${handle.name}. D'ora in poi ogni modifica viene salvata anche lì.` }
      : { ok: false, messaggio: 'File scelto ma scrittura non riuscita: riprova con "Salva ora".' }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, messaggio: '' }
    return { ok: false, messaggio: String((e as Error)?.message ?? e) }
  }
}

/** Apre un archivio esistente e lo carica al posto dei dati di questo browser. */
export async function apriArchivioDaFile(): Promise<{ ok: boolean; messaggio: string; utenti?: number; immobili?: number }> {
  try {
    const [handle] = await window.showOpenFilePicker!({
      types: [{ description: 'Archivio TR.A.V.I.', accept: { 'application/json': ['.travidb'] } }],
    })
    if (!handle) return { ok: false, messaggio: '' }
    const testo = await (await handle.getFile()).text()
    let dump: {
      formato?: string
      utenti?: UtenteArchivio[]
      immobili?: Immobile[]
      preferenze?: { k: string; v: string }[]
    }
    try {
      dump = JSON.parse(testo)
    } catch {
      throw new Error('Il file non è un archivio TR.A.V.I. valido.')
    }
    if (dump.formato !== FORMATO_ARCHIVIO || !Array.isArray(dump.utenti)) {
      throw new Error('Il file non è un archivio TR.A.V.I. valido.')
    }
    inSincronizzazione = true
    try {
      await svuota('utenti')
      await svuota('immobili')
      await svuota('preferenze')
      for (const u of dump.utenti) await metti('utenti', u)
      for (const i of dump.immobili ?? []) await metti('immobili', i)
      for (const p of dump.preferenze ?? []) await metti('preferenze', p)
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

export async function salvaArchivioOra(): Promise<{ ok: boolean; messaggio: string }> {
  const scritto = await specchiaOra(true)
  return scritto
    ? { ok: true, messaggio: 'Archivio salvato sul file.' }
    : { ok: false, messaggio: 'Salvataggio non riuscito: nessun file collegato o permesso negato.' }
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
let importInAttesa: { immobili: ImmobileInput[]; nome: string } | null = null

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
          await metti('immobili', {
            id: crypto.randomUUID(),
            asset,
            denominazione: den,
            portafoglio: pulisci(r.portafoglio),
            localizzazione: pulisci(r.localizzazione),
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
          await metti('immobili', {
            ...attuale,
            asset,
            denominazione: den,
            portafoglio: pulisci(r.portafoglio),
            localizzazione: pulisci(r.localizzazione),
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
          }
          try {
            pacchetto = JSON.parse(await file.text())
          } catch {
            throw new Error("Il file non è un'esportazione TR.A.V.I. valida.")
          }
          if (!pacchetto || pacchetto.formato !== FORMATO_ESPORTAZIONE || !Array.isArray(pacchetto.immobili)) {
            throw new Error("Il file non è un'esportazione TR.A.V.I. valida.")
          }
          importInAttesa = { immobili: pacchetto.immobili, nome: file.name }
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
                  })),
                },
                null,
                1,
              ),
            )
          } catch {
            /* il backup è una cortesia: non blocca l'importazione */
          }
          await svuota('immobili')
          let importati = 0
          for (const r of importInAttesa.immobili) {
            const asset = pulisci(r.asset)
            const den = pulisci(r.denominazione)
            if (!asset || !den) continue
            await metti('immobili', {
              id: crypto.randomUUID(),
              asset,
              denominazione: den,
              portafoglio: pulisci(r.portafoglio),
              localizzazione: pulisci(r.localizzazione),
              creato_il: new Date().toISOString(),
            } satisfies Immobile)
            importati++
          }
          importInAttesa = null
          return { copiaSicurezza: `Download → ${nomeBackup}`, immobili: importati }
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
      // la pagina (che È l'aggiornamento, nella versione browser)
      controlla: () =>
        rispondi(async () => {
          try {
            const r = await fetch(`./version.json?_=${Date.now()}`, { cache: 'no-store' })
            const dati = (await r.json()) as { version?: string }
            if (dati.version && dati.version !== __APP_VERSION__) {
              window.location.reload()
            }
          } catch {
            /* offline: nessun aggiornamento da segnalare */
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
