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
const CHIAVE_SESSIONE = 'travi_sessione'

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

async function metti(store: string, valore: unknown): Promise<void> {
  const db = await apriIdb()
  return new Promise((risolvi, rifiuta) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(valore)
    tx.oncomplete = () => risolvi()
    tx.onerror = () => rifiuta(tx.error)
  })
}

async function togli(store: string, chiave: string): Promise<void> {
  const db = await apriIdb()
  return new Promise((risolvi, rifiuta) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(chiave)
    tx.oncomplete = () => risolvi()
    tx.onerror = () => rifiuta(tx.error)
  })
}

async function svuota(store: string): Promise<void> {
  const db = await apriIdb()
  return new Promise((risolvi, rifiuta) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => risolvi()
    tx.onerror = () => rifiuta(tx.error)
  })
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

  return {
    auth: {
      stato: () =>
        rispondi(async () => {
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
          const mail = String(email || '').trim().toLowerCase()
          const utenti = await tutti<UtenteArchivio>('utenti')
          const u = utenti.find((x) => x.email.toLowerCase() === mail)
          if (!u || (await calcolaHash(password || '', u.pwd_salt)) !== u.pwd_hash) {
            throw new Error('Nome utente o password non corretti.')
          }
          if (!u.attivo) throw new Error('Utente disattivato: contatta un amministratore.')
          scriviSessione({ id: u.id })
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
