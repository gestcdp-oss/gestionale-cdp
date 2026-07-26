// TR.A.V.I. — processo principale Electron.
// App COMPLETAMENTE locale: database SQLite nella cartella "dati" accanto all'eseguibile.
// Nessuna connessione a internet.

const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const SMOKE = process.argv.includes('--smoke')

if (SMOKE) {
  // niente GPU nel test automatico (va chiamato PRIMA di app.whenReady)
  app.disableHardwareAcceleration()
  process.on('unhandledRejection', (e) => {
    console.error('[SMOKE] rejection:', e)
    app.exit(1)
  })
  process.on('uncaughtException', (e) => {
    console.error('[SMOKE] exception:', e)
    app.exit(1)
  })
}

/** @type {import('better-sqlite3').Database | null} */
let db = null
/** Utente attualmente connesso (sessione in memoria: si perde alla chiusura). */
let sessione = null

// La cartella dei dati sta SEMPRE accanto all'eseguibile (portable) o,
// in sviluppo, dentro la cartella del progetto.
function cartellaDati() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'dati')
  }
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath('exe')), 'dati')
  }
  return path.join(process.cwd(), 'dati')
}

function apriDb() {
  const Database = require('better-sqlite3')
  const dir = cartellaDati()
  fs.mkdirSync(dir, { recursive: true })
  db = new Database(path.join(dir, 'travi.db'))
  db.pragma('journal_mode = WAL') // veloce e sicuro su disco locale
  db.pragma('synchronous = NORMAL')
  db.exec(`
    create table if not exists immobili (
      id             text primary key,
      asset          text not null,
      denominazione  text not null,
      portafoglio    text,
      localizzazione text,
      creato_il      text not null default (datetime('now')),
      aggiornato_il  text not null default (datetime('now'))
    );
    create unique index if not exists immobili_asset_uidx on immobili (lower(trim(asset)));
    create unique index if not exists immobili_denom_uidx on immobili (lower(trim(denominazione)));

    create table if not exists utenti (
      id            text primary key,
      nome          text,
      cognome       text,
      email         text not null,
      pwd_hash      text not null,
      pwd_salt      text not null,
      ruolo         text not null default 'utente',
      attivo        integer not null default 1,
      creato_il     text not null default (datetime('now')),
      aggiornato_il text not null default (datetime('now'))
    );
    create unique index if not exists utenti_email_uidx on utenti (lower(trim(email)));

    create table if not exists preferenze (
      utente_id text not null,
      chiave    text not null,
      valore    text,
      primary key (utente_id, chiave)
    );

    create table if not exists app_meta (k text primary key, v text);
  `)
  seminaSeServe()
}

// Primo avvio: precarica gli immobili dal seed (una volta sola).
function seminaSeServe() {
  const fatto = db.prepare("select v from app_meta where k = 'seed_immobili'").get()
  if (fatto) return
  const fileSeed = path.join(__dirname, 'seed-immobili.json')
  if (fs.existsSync(fileSeed)) {
    try {
      const lista = JSON.parse(fs.readFileSync(fileSeed, 'utf8'))
      const ins = db.prepare(
        'insert or ignore into immobili (id, asset, denominazione, portafoglio, localizzazione) values (?, ?, ?, ?, ?)',
      )
      const tx = db.transaction((righe) => {
        for (const r of righe) {
          ins.run(crypto.randomUUID(), r.asset, r.denominazione, r.portafoglio || null, r.localizzazione || null)
        }
      })
      tx(lista)
    } catch (e) {
      console.error('Seed non caricato:', e)
    }
  }
  db.prepare("insert or replace into app_meta (k, v) values ('seed_immobili', 'fatto')").run()
}

// ---------- helper ----------
function pulisci(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function eDuplicato(e) {
  return e && (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE/i.test(String(e.message || '')))
}

function rispondi(fn) {
  try {
    return { data: fn(), error: null }
  } catch (e) {
    if (eDuplicato(e)) {
      return { data: null, error: { code: '23505', message: 'Valore già presente (asset, denominazione o email).' } }
    }
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
}

/** Blocca le operazioni sui dati se nessuno ha fatto login. */
function richiediSessione() {
  if (!sessione) throw new Error('Sessione non attiva: effettua il login.')
  return sessione
}

function richiediAdmin() {
  const s = richiediSessione()
  if (s.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
  return s
}

// Amministratore permanente: non può essere eliminato, declassato o disattivato
// da nessuno (nemmeno da sé stesso). Serve a non restare mai fuori dal programma.
const ADMIN_PERMANENTE = 'marabelli.s@gmail.com'

function ePermanente(email) {
  return String(email || '').trim().toLowerCase() === ADMIN_PERMANENTE
}

// ---------- password ----------
function calcolaHash(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex')
}

function passwordCorretta(utente, password) {
  const atteso = Buffer.from(utente.pwd_hash, 'hex')
  const dato = Buffer.from(calcolaHash(password, utente.pwd_salt), 'hex')
  return atteso.length === dato.length && crypto.timingSafeEqual(atteso, dato)
}

function validaPassword(password) {
  const p = String(password || '')
  if (p.length < 8) throw new Error('La password deve avere almeno 8 caratteri.')
  return p
}

function profiloPubblico(u) {
  return {
    id: u.id,
    nome: u.nome,
    cognome: u.cognome,
    email: u.email,
    ruolo: u.ruolo,
    attivo: !!u.attivo,
  }
}

function inserisciUtente({ nome, cognome, email, password, ruolo }) {
  const mail = pulisci(email)
  if (!mail) throw new Error("L'indirizzo email (nome utente) è obbligatorio.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('Indirizzo email non valido.')
  const pwd = validaPassword(password)
  const salt = crypto.randomBytes(16).toString('hex')
  const id = crypto.randomUUID()
  // l'amministratore permanente è sempre amministratore
  const liv = ePermanente(mail) || ruolo === 'admin' ? 'admin' : 'utente'
  db.prepare(
    `insert into utenti (id, nome, cognome, email, pwd_hash, pwd_salt, ruolo)
     values (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, pulisci(nome), pulisci(cognome), mail.toLowerCase(), calcolaHash(pwd, salt), salt, liv)
  return id
}

// ---------- operazioni sugli utenti (con la sessione come parametro: testabili) ----------
function elencoUtenti(s) {
  // solo gli amministratori vedono l'elenco degli utenti registrati
  if (!s || s.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
  return db
    .prepare('select id, nome, cognome, email, ruolo, attivo, creato_il from utenti order by lower(cognome), lower(nome)')
    .all()
    .map((u) => ({ ...u, attivo: !!u.attivo, permanente: ePermanente(u.email) }))
}

function aggiornaUtente(s, id, campi) {
  if (!s) throw new Error('Sessione non attiva.')
  // ognuno può modificare i propri dati; solo l'admin può modificare gli altri
  if (s.id !== id && s.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
  const attuale = db.prepare('select * from utenti where id = ?').get(id)
  if (!attuale) throw new Error('Utente non trovato.')

  const mail = pulisci(campi.email)
  if (!mail) throw new Error("L'indirizzo email (nome utente) è obbligatorio.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('Indirizzo email non valido.')

  let ruolo = s.ruolo === 'admin' && campi.ruolo ? (campi.ruolo === 'admin' ? 'admin' : 'utente') : undefined
  let email = mail.toLowerCase()

  if (ePermanente(attuale.email)) {
    // l'amministratore permanente resta tale: email e ruolo non si toccano
    if (email !== String(attuale.email).toLowerCase()) {
      throw new Error("L'amministratore permanente non può cambiare indirizzo email.")
    }
    ruolo = 'admin'
  }

  // non lasciare il programma senza amministratori
  if (ruolo === 'utente') {
    const admin = db.prepare("select count(*) as n from utenti where ruolo = 'admin' and id <> ?").get(id).n
    if (admin === 0) throw new Error('Deve restare almeno un amministratore.')
  }

  db.prepare(
    `update utenti
        set nome = ?, cognome = ?, email = ?, ruolo = coalesce(?, ruolo), aggiornato_il = datetime('now')
      where id = ?`,
  ).run(pulisci(campi.nome), pulisci(campi.cognome), email, ruolo ?? null, id)
  return null
}

function eliminaUtente(s, id) {
  if (!s || s.ruolo !== 'admin') throw new Error('Operazione riservata agli amministratori.')
  if (s.id === id) throw new Error('Non puoi eliminare te stesso.')
  const u = db.prepare('select email, ruolo from utenti where id = ?').get(id)
  if (!u) throw new Error('Utente non trovato.')
  if (ePermanente(u.email)) {
    throw new Error("Questo è l'amministratore permanente: non può essere eliminato.")
  }
  if (u.ruolo === 'admin') {
    const admin = db.prepare("select count(*) as n from utenti where ruolo = 'admin' and id <> ?").get(id).n
    if (admin === 0) throw new Error('Deve restare almeno un amministratore.')
  }
  db.prepare('delete from preferenze where utente_id = ?').run(id)
  db.prepare('delete from utenti where id = ?').run(id)
  return null
}

function contaUtenti() {
  return db.prepare('select count(*) as n from utenti').get().n
}

// ---------- IPC: autenticazione ----------
ipcMain.handle('auth:stato', () =>
  rispondi(() => ({
    serveSetup: contaUtenti() === 0,
    utente: sessione ? { ...sessione } : null,
  })),
)

// Primo avvio: crea l'amministratore iniziale (consentito solo se non ci sono utenti).
ipcMain.handle('auth:setup', (_ev, r) =>
  rispondi(() => {
    if (contaUtenti() > 0) throw new Error('Esiste già almeno un utente: usa il login.')
    const id = inserisciUtente({ ...r, ruolo: 'admin' })
    const u = db.prepare('select * from utenti where id = ?').get(id)
    sessione = profiloPubblico(u)
    return { ...sessione }
  }),
)

ipcMain.handle('auth:login', (_ev, { email, password }) =>
  rispondi(() => {
    const mail = String(email || '').trim().toLowerCase()
    const u = db.prepare('select * from utenti where lower(trim(email)) = ?').get(mail)
    if (!u || !passwordCorretta(u, password || '')) {
      throw new Error('Nome utente o password non corretti.')
    }
    if (!u.attivo) throw new Error('Utente disattivato: contatta un amministratore.')
    sessione = profiloPubblico(u)
    return { ...sessione }
  }),
)

ipcMain.handle('auth:logout', () =>
  rispondi(() => {
    sessione = null
    return null
  }),
)

ipcMain.handle('auth:cambia-password', (_ev, { vecchia, nuova }) =>
  rispondi(() => {
    const s = richiediSessione()
    const u = db.prepare('select * from utenti where id = ?').get(s.id)
    if (!u || !passwordCorretta(u, vecchia || '')) throw new Error('La password attuale non è corretta.')
    const pwd = validaPassword(nuova)
    const salt = crypto.randomBytes(16).toString('hex')
    db.prepare("update utenti set pwd_hash = ?, pwd_salt = ?, aggiornato_il = datetime('now') where id = ?").run(
      calcolaHash(pwd, salt),
      salt,
      s.id,
    )
    return null
  }),
)

// ---------- IPC: utenti ----------
ipcMain.handle('utenti:list', () => rispondi(() => elencoUtenti(richiediSessione())))

ipcMain.handle('utenti:insert', (_ev, r) =>
  rispondi(() => {
    richiediAdmin()
    inserisciUtente(r)
    return null
  }),
)

ipcMain.handle('utenti:update', (_ev, { id, campi }) =>
  rispondi(() => {
    aggiornaUtente(richiediSessione(), id, campi)
    if (sessione && sessione.id === id) {
      const u = db.prepare('select * from utenti where id = ?').get(id)
      sessione = profiloPubblico(u)
    }
    return null
  }),
)

// L'amministratore può assegnare una nuova password a un altro utente
// (le password non sono recuperabili: si possono solo reimpostare).
ipcMain.handle('utenti:reset-password', (_ev, { id, nuova }) =>
  rispondi(() => {
    const s = richiediAdmin()
    const bersaglio = db.prepare('select email from utenti where id = ?').get(id)
    if (bersaglio && ePermanente(bersaglio.email) && s.id !== id) {
      throw new Error("Solo l'amministratore permanente può cambiare la propria password.")
    }
    const pwd = validaPassword(nuova)
    const salt = crypto.randomBytes(16).toString('hex')
    const info = db
      .prepare("update utenti set pwd_hash = ?, pwd_salt = ?, aggiornato_il = datetime('now') where id = ?")
      .run(calcolaHash(pwd, salt), salt, id)
    if (info.changes === 0) throw new Error('Utente non trovato.')
    return null
  }),
)

ipcMain.handle('utenti:delete', (_ev, id) => rispondi(() => eliminaUtente(richiediSessione(), id)))

// ---------- IPC: preferenze (per utente) ----------
ipcMain.handle('pref:tutte', () =>
  rispondi(() => {
    const s = richiediSessione()
    const righe = db.prepare('select chiave, valore from preferenze where utente_id = ?').all(s.id)
    const out = {}
    for (const r of righe) out[r.chiave] = r.valore
    return out
  }),
)

ipcMain.handle('pref:imposta', (_ev, { chiave, valore }) =>
  rispondi(() => {
    const s = richiediSessione()
    db.prepare('insert or replace into preferenze (utente_id, chiave, valore) values (?, ?, ?)').run(
      s.id,
      String(chiave),
      valore === null || valore === undefined ? null : String(valore),
    )
    return null
  }),
)

// ---------- IPC: immobili ----------
ipcMain.handle('immobili:list', () =>
  rispondi(() => {
    richiediSessione()
    return db.prepare('select id, asset, denominazione, portafoglio, localizzazione, creato_il from immobili').all()
  }),
)

ipcMain.handle('immobili:insert', (_ev, r) =>
  rispondi(() => {
    richiediSessione()
    const asset = pulisci(r.asset)
    const den = pulisci(r.denominazione)
    if (!asset || !den) throw new Error('Asset e Denominazione sono obbligatori.')
    db.prepare(
      'insert into immobili (id, asset, denominazione, portafoglio, localizzazione) values (?, ?, ?, ?, ?)',
    ).run(crypto.randomUUID(), asset, den, pulisci(r.portafoglio), pulisci(r.localizzazione))
    return null
  }),
)

ipcMain.handle('immobili:update', (_ev, { id, campi }) =>
  rispondi(() => {
    richiediSessione()
    const asset = pulisci(campi.asset)
    const den = pulisci(campi.denominazione)
    if (!asset || !den) throw new Error('Asset e Denominazione sono obbligatori.')
    db.prepare(
      `update immobili
         set asset = ?, denominazione = ?, portafoglio = ?, localizzazione = ?, aggiornato_il = datetime('now')
       where id = ?`,
    ).run(asset, den, pulisci(campi.portafoglio), pulisci(campi.localizzazione), id)
    return null
  }),
)

ipcMain.handle('immobili:delete', (_ev, id) =>
  rispondi(() => {
    richiediSessione()
    // In futuro: qui si cancelleranno anche tutte le attività collegate all'asset.
    db.prepare('delete from immobili where id = ?').run(id)
    return null
  }),
)

ipcMain.handle('app:versione', () => app.getVersion())

// ---------- finestra ----------
function creaFinestra() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'TR.A.V.I.',
    backgroundColor: '#E6F0F8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  Menu.setApplicationMenu(null)
  void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  return win
}

// ---------- smoke test (verifica automatica senza finestra) ----------
function smoke() {
  const rapporto = {}
  try {
    apriDb()
    rapporto.cartella_dati = cartellaDati()
    rapporto.immobili_iniziali = db.prepare('select count(*) as n from immobili').get().n

    // --- immobili: inserimento/modifica/cancellazione
    const id = crypto.randomUUID()
    const marca = 'SMOKE-' + id.slice(0, 8)
    db.prepare('insert into immobili (id, asset, denominazione) values (?, ?, ?)').run(id, marca, 'PROVA ' + marca)
    db.prepare("update immobili set localizzazione = 'test' where id = ?").run(id)
    rapporto.dopo_insert = db.prepare('select count(*) as n from immobili').get().n
    db.prepare('delete from immobili where id = ?').run(id)
    rapporto.dopo_delete = db.prepare('select count(*) as n from immobili').get().n

    // --- utenti e password
    const mail = `smoke.${id.slice(0, 6)}@test.local`
    const uid = inserisciUtente({ nome: 'Prova', cognome: 'Smoke', email: mail, password: 'password123', ruolo: 'admin' })
    const u = db.prepare('select * from utenti where id = ?').get(uid)
    rapporto.password_giusta = passwordCorretta(u, 'password123')
    rapporto.password_sbagliata_respinta = !passwordCorretta(u, 'sbagliata!')
    rapporto.hash_non_in_chiaro = !String(u.pwd_hash).includes('password123')
    let corta = false
    try {
      validaPassword('abc')
    } catch {
      corta = true
    }
    rapporto.password_corta_respinta = corta

    // --- permessi: solo gli amministratori vedono l'elenco utenti
    const sessioneAdmin = { id: uid, ruolo: 'admin', email: mail }
    const sessioneUtente = { id: 'x', ruolo: 'utente', email: 'tale@test.local' }
    rapporto.elenco_admin_ok = Array.isArray(elencoUtenti(sessioneAdmin))
    let negato = false
    try {
      elencoUtenti(sessioneUtente)
    } catch {
      negato = true
    }
    rapporto.elenco_negato_a_utente = negato

    // --- amministratore permanente: non eliminabile, non declassabile
    const idPerm = inserisciUtente({
      nome: 'Permanente',
      cognome: 'Admin',
      email: ADMIN_PERMANENTE,
      password: 'password123',
      ruolo: 'utente', // deve diventare admin comunque
    })
    const perm = db.prepare('select * from utenti where id = ?').get(idPerm)
    rapporto.permanente_e_admin = perm.ruolo === 'admin'
    let elimNegata = false
    try {
      eliminaUtente(sessioneAdmin, idPerm)
    } catch {
      elimNegata = true
    }
    rapporto.permanente_non_eliminabile = elimNegata
    let declassNegato = false
    try {
      aggiornaUtente(sessioneAdmin, idPerm, { nome: 'P', cognome: 'A', email: ADMIN_PERMANENTE, ruolo: 'utente' })
    } catch {
      declassNegato = true
    }
    const permDopo = db.prepare('select ruolo from utenti where id = ?').get(idPerm)
    rapporto.permanente_resta_admin = permDopo.ruolo === 'admin' || declassNegato
    // un utente normale non può eliminare nessuno
    let elimUtenteNegata = false
    try {
      eliminaUtente(sessioneUtente, uid)
    } catch {
      elimUtenteNegata = true
    }
    rapporto.utente_non_puo_eliminare = elimUtenteNegata
    db.prepare('delete from utenti where id = ?').run(idPerm)

    // --- preferenze
    db.prepare('insert or replace into preferenze (utente_id, chiave, valore) values (?, ?, ?)').run(uid, 'tema', 'bordeaux')
    db.prepare('insert or replace into preferenze (utente_id, chiave, valore) values (?, ?, ?)').run(uid, 'per_pagina', '30')
    const prefs = db.prepare('select chiave, valore from preferenze where utente_id = ?').all(uid)
    rapporto.preferenze = Object.fromEntries(prefs.map((p) => [p.chiave, p.valore]))

    // --- pulizia
    db.prepare('delete from preferenze where utente_id = ?').run(uid)
    db.prepare('delete from utenti where id = ?').run(uid)
    rapporto.utenti_residui = contaUtenti()

    rapporto.ok =
      rapporto.password_giusta &&
      rapporto.password_sbagliata_respinta &&
      rapporto.hash_non_in_chiaro &&
      rapporto.password_corta_respinta &&
      rapporto.elenco_admin_ok &&
      rapporto.elenco_negato_a_utente &&
      rapporto.permanente_e_admin &&
      rapporto.permanente_non_eliminabile &&
      rapporto.permanente_resta_admin &&
      rapporto.utente_non_puo_eliminare &&
      rapporto.preferenze.tema === 'bordeaux' &&
      rapporto.preferenze.per_pagina === '30' &&
      rapporto.dopo_delete === rapporto.immobili_iniziali
  } catch (e) {
    rapporto.ok = false
    rapporto.errore = String((e && e.stack) || e)
  }
  try {
    fs.mkdirSync(cartellaDati(), { recursive: true })
    fs.writeFileSync(path.join(cartellaDati(), 'rapporto-smoke.json'), JSON.stringify(rapporto, null, 2))
  } catch {
    /* ignora */
  }
  console.log('[SMOKE]', JSON.stringify(rapporto))
  app.exit(rapporto.ok ? 0 : 1)
}

// ---------- avvio ----------
if (!SMOKE) {
  const lock = app.requestSingleInstanceLock()
  if (!lock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      const [win] = BrowserWindow.getAllWindows()
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    })
  }
}

app.whenReady().then(() => {
  if (SMOKE) {
    smoke()
    return
  }
  try {
    apriDb()
  } catch (e) {
    dialog.showErrorBox('TR.A.V.I. — errore database', String((e && e.message) || e))
    app.exit(1)
    return
  }
  creaFinestra()
})

app.on('window-all-closed', () => {
  if (db) db.close()
  app.quit()
})
