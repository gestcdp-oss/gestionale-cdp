// TR.A.V.I. — processo principale Electron.
// App COMPLETAMENTE locale: database SQLite nella cartella "dati" accanto all'eseguibile.
// Nessuna connessione a internet.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const agg = require('./aggiornamenti.cjs')
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

function apriDb(nomeFile = 'travi.db') {
  const Database = require('better-sqlite3')
  const dir = cartellaDati()
  fs.mkdirSync(dir, { recursive: true })
  db = new Database(path.join(dir, nomeFile))
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

// Primo avvio: se è presente un file di precaricamento lo applica (una volta sola).
// ATTENZIONE: il file NON viene incluso nell'eseguibile distribuito (vedi package.json,
// "!electron/seed-immobili.json"): chi scarica l'app parte da un archivio VUOTO.
// I dati si trasferiscono tra installazioni con Esporta/Importa database.
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

// ---------- mappa (Google Maps) ----------
// ATTENZIONE: aprire la mappa invia la localizzazione a Google (unica funzione
// dell'app che esce su internet). Tutto il resto resta sul computer.
/** true se il testo è una coppia di coordinate (es. "41.9028, 12.4964"). */
function sonoCoordinate(q) {
  return /^-?\d{1,3}([.,]\d+)?\s*[,;]\s*-?\d{1,3}([.,]\d+)?$/.test(String(q).trim())
}

function urlMappa(query, modo) {
  const q = String(query || '').trim()
  if (!q) throw new Error('Localizzazione non indicata.')
  if (modo === 'browser') {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  }
  // Mappa incorporata: serve l'indirizzo "classico" con iwloc, altrimenti Google
  // centra la vista ma non pianta il segnaposto rosso. Per le coordinate serve
  // il prefisso loc: (senza, le interpreta come semplice centro della mappa).
  const punto = sonoCoordinate(q) ? `loc:${q.replace(/;/, ',').replace(/\s+/g, '')}` : q
  return `https://maps.google.com/maps?q=${encodeURIComponent(punto)}&hl=it&z=16&ie=UTF8&iwloc=B&output=embed`
}

const HOST_AMMESSI = /(^|\.)(google\.com|google\.it|gstatic\.com|googleapis\.com|ggpht\.com)$/i

function hostAmmesso(url) {
  try {
    return HOST_AMMESSI.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/** @type {BrowserWindow | null} */
let finestraMappa = null

function paginaErroreMappa(titolo) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;display:flex;align-items:center;
    justify-content:center;height:100vh;font-family:system-ui,'Segoe UI',sans-serif;background:#e6f0f8;color:#37596f">
    <div style="text-align:center;max-width:420px;padding:24px">
      <div style="font-size:40px">🌐</div>
      <h2 style="margin:12px 0 6px">Mappa non disponibile</h2>
      <p style="margin:0;line-height:1.5;color:#426e96">Non è stato possibile aprire Google Maps per
      <b>${String(titolo).replace(/[<>&]/g, '')}</b>.<br>Serve una connessione a internet.</p>
    </div></body>`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

// La mappa "embed" di Google funziona SOLO dentro un iframe: carichiamo quindi
// una paginetta locale (electron/mappa.html) che ospita l'iframe.
function caricaMappa(finestra, query) {
  // l'indirizzo della mappa lo calcola il programma (così è verificabile);
  // la pagina locale si limita a ospitarlo nell'iframe
  return finestra.loadFile(path.join(__dirname, 'mappa.html'), {
    query: { q: String(query), src: urlMappa(query, 'finestra') },
  })
}

function apriFinestraMappa(query) {
  if (finestraMappa && !finestraMappa.isDestroyed()) {
    void caricaMappa(finestraMappa, query)
    finestraMappa.setTitle(`Mappa — ${query}`)
    finestraMappa.show()
    finestraMappa.focus()
    return
  }
  const principale = BrowserWindow.getAllWindows()[0] ?? undefined
  finestraMappa = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 420,
    minHeight: 320,
    parent: principale,
    title: `Mappa — ${query}`,
    backgroundColor: '#e6f0f8',
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  finestraMappa.setMenu(null)
  // la finestra mostra solo mappe Google: qualsiasi altra destinazione va nel browser
  finestraMappa.webContents.setWindowOpenHandler(({ url: u }) => {
    void shell.openExternal(u)
    return { action: 'deny' }
  })
  // la pagina principale resta locale; l'iframe può andare solo su Google
  finestraMappa.webContents.on('will-navigate', (ev, u) => {
    if (!u.startsWith('file://') && !hostAmmesso(u)) ev.preventDefault()
  })
  finestraMappa.webContents.on('did-fail-load', (_e, codice, _desc, urlFallito, principale) => {
    if (codice === -3) return // caricamento annullato: non è un errore
    if (principale && String(urlFallito || '').startsWith('file://')) {
      void finestraMappa?.loadURL(paginaErroreMappa(query))
    }
  })
  finestraMappa.on('closed', () => {
    finestraMappa = null
  })
  void caricaMappa(finestraMappa, query)
}

ipcMain.handle('mappa:apri', (_ev, { query, modo }) =>
  rispondi(() => {
    richiediSessione()
    if (modo === 'browser') {
      void shell.openExternal(urlMappa(query, 'browser'))
    } else {
      apriFinestraMappa(String(query).trim())
    }
    return null
  }),
)

// ---------- esporta / importa il database ----------
// Serve a passare i dati a un collega: si esporta un file, lui lo importa e il
// suo archivio viene sostituito da quello ricevuto.

const TABELLE_ATTESE = ['immobili', 'utenti', 'preferenze', 'app_meta']

function riavviaApp() {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE
  if (portable) {
    const { spawn } = require('node:child_process')
    const p = spawn(portable, [], { detached: true, stdio: 'ignore', cwd: path.dirname(portable) })
    p.unref()
  } else {
    app.relaunch()
  }
  app.exit(0)
}

ipcMain.handle('db:esporta', async () => {
  try {
    const s = richiediSessione()
    const oggi = new Date().toISOString().slice(0, 10)
    const scelta = await dialog.showSaveDialog({
      title: 'Esporta database TR.A.V.I.',
      defaultPath: `TRAVI-database-${oggi}.travidb`,
      filters: [{ name: 'Database TR.A.V.I.', extensions: ['travidb'] }],
    })
    if (scelta.canceled || !scelta.filePath) return { data: null, error: null }

    // marchia il file con versione e provenienza (serve al controllo in import)
    const meta = db.prepare('insert or replace into app_meta (k, v) values (?, ?)')
    meta.run('versione_app', app.getVersion())
    meta.run('esportato_il', new Date().toISOString())
    meta.run('esportato_da', s.email)

    await db.backup(scelta.filePath) // copia consistente anche con l'app aperta
    return { data: { percorso: scelta.filePath }, error: null }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

// Passo 1: sceglie il file e lo verifica, senza toccare nulla.
ipcMain.handle('db:verifica-import', async () => {
  try {
    richiediSessione() // l'importazione è consentita a tutti gli utenti
    const scelta = await dialog.showOpenDialog({
      title: 'Importa database TR.A.V.I.',
      properties: ['openFile'],
      filters: [{ name: 'Database TR.A.V.I.', extensions: ['travidb', 'db'] }],
    })
    if (scelta.canceled || !scelta.filePaths[0]) return { data: null, error: null }
    const percorso = scelta.filePaths[0]

    const Database = require('better-sqlite3')
    let prova
    try {
      prova = new Database(percorso, { readonly: true, fileMustExist: true })
    } catch {
      throw new Error('Il file non è un database TR.A.V.I. valido.')
    }
    try {
      const tabelle = prova
        .prepare("select name from sqlite_master where type = 'table'")
        .all()
        .map((r) => r.name)
      for (const attesa of TABELLE_ATTESE) {
        if (!tabelle.includes(attesa)) throw new Error('Il file non è un database TR.A.V.I. valido.')
      }
      const riga = prova.prepare("select v from app_meta where k = 'versione_app'").get()
      const versioneFile = riga ? String(riga.v) : ''
      if (versioneFile !== app.getVersion()) {
        throw new Error(
          `Il file è stato esportato con la versione ${versioneFile || 'sconosciuta'}, ` +
            `mentre qui è installata la ${app.getVersion()}. Aggiornate entrambi i programmi alla stessa versione e riprovate.`,
        )
      }
      const immobili = prova.prepare('select count(*) as n from immobili').get().n
      const utenti = prova.prepare('select count(*) as n from utenti').get().n
      const daRiga = prova.prepare("select v from app_meta where k = 'esportato_da'").get()
      const ilRiga = prova.prepare("select v from app_meta where k = 'esportato_il'").get()
      return {
        data: {
          percorso,
          versione: versioneFile,
          immobili,
          utenti,
          esportatoDa: daRiga ? String(daRiga.v) : '',
          esportatoIl: ilRiga ? String(ilRiga.v) : '',
          // quanti dati verrebbero sostituiti
          immobiliAttuali: db.prepare('select count(*) as n from immobili').get().n,
          utentiAttuali: db.prepare('select count(*) as n from utenti').get().n,
        },
        error: null,
      }
    } finally {
      prova.close()
    }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

// Passo 2: sostituisce davvero l'archivio (con copia di sicurezza) e riavvia.
ipcMain.handle('db:applica-import', async (_ev, percorso) => {
  try {
    richiediSessione() // l'importazione è consentita a tutti gli utenti
    if (!percorso || !fs.existsSync(percorso)) throw new Error('File non trovato.')
    const dir = cartellaDati()
    const attuale = path.join(dir, 'travi.db')
    const marca = new Date().toISOString().replace(/[:.]/g, '-')
    const copiaSicurezza = path.join(dir, `backup-prima-import-${marca}.db`)

    // copia di sicurezza dell'archivio esistente PRIMA di sostituirlo
    await db.backup(copiaSicurezza)
    db.close()
    db = null

    fs.copyFileSync(percorso, attuale)
    for (const suffisso of ['-wal', '-shm']) {
      try {
        fs.unlinkSync(attuale + suffisso)
      } catch {
        /* non esiste: ok */
      }
    }
    sessione = null
    setTimeout(riavviaApp, 600)
    return { data: { copiaSicurezza }, error: null }
  } catch (e) {
    // se qualcosa è andato storto riapriamo l'archivio esistente
    try {
      if (!db) apriDb()
    } catch {
      /* ignora */
    }
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})

// ---------- aggiornamenti ----------
// Registro su file: serve a capire, anche a distanza, perché un computer non si
// aggiorna (nessuna rete? release non trovata? download interrotto?).
function registra(messaggio) {
  try {
    const riga = `${new Date().toISOString()}  ${messaggio}\n`
    fs.mkdirSync(cartellaDati(), { recursive: true })
    fs.appendFileSync(path.join(cartellaDati(), 'registro-aggiornamenti.txt'), riga)
  } catch {
    /* il registro non deve mai bloccare nulla */
  }
  console.log('[agg]', messaggio)
}

// Stato condiviso con l'interfaccia: fase, avanzamento, versione trovata.
let statoAgg = {
  supportato: false,
  versioneCorrente: '',
  fase: 'inattivo', // inattivo | controllo | disponibile | download | installazione | aggiornato | errore
  percentuale: 0,
  disponibile: null, // { versione, note }
  messaggio: '',
}

function inviaStatoAgg() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('agg:stato', statoAgg)
  }
}

function aggiornaStato(patch) {
  statoAgg = { ...statoAgg, ...patch }
  inviaStatoAgg()
}

/** Controlla se esiste una versione più recente. Non installa nulla. */
async function controllaAggiornamenti() {
  if (!agg.aggiornamentoSupportato()) {
    registra('controllo saltato: non è la versione portable')
    aggiornaStato({ fase: 'inattivo', messaggio: 'Aggiornamento automatico attivo solo in versione portable.' })
    return null
  }
  registra(`controllo avviato (versione installata ${app.getVersion()})`)
  aggiornaStato({ fase: 'controllo', messaggio: '', percentuale: 0 })
  try {
    const info = await agg.cercaAggiornamento(app.getVersion())
    if (!info) {
      registra('controllo concluso: nessuna versione più recente')
      aggiornaStato({ fase: 'inattivo', disponibile: null, messaggio: '' })
      return null
    }
    registra(`controllo concluso: trovata versione ${info.versione}`)
    ultimoAggiornamento = info
    const precedenti = leggiTentativi()
    const falliti = precedenti.versione === info.versione ? precedenti.tentativi : 0
    info.autoInstalla = falliti < MAX_TENTATIVI
    if (!info.autoInstalla) {
      registra(`installazione automatica sospesa: ${falliti} tentativi falliti per la ${info.versione}`)
    }
    aggiornaStato({
      fase: 'disponibile',
      disponibile: { versione: info.versione, note: info.note },
      messaggio: '',
    })
    return info
  } catch (e) {
    // nessuna rete o GitHub irraggiungibile: si continua a lavorare normalmente
    registra(`controllo fallito: ${String((e && e.message) || e)}`)
    aggiornaStato({ fase: 'errore', messaggio: String((e && e.message) || e) })
    return null
  }
}

/** @type {null | object} */
let ultimoAggiornamento = null

// Anti-ciclo: se l'installazione di una versione fallisce più volte, si smette di
// riprovare da soli all'avvio (resta il banner, decide l'utente). Serve a non
// restare mai intrappolati in un ciclo di riavvii.
const MAX_TENTATIVI = 3
const FILE_TENTATIVI = 'stato-aggiornamento.json'

function leggiTentativi() {
  try {
    const dati = JSON.parse(fs.readFileSync(path.join(cartellaDati(), FILE_TENTATIVI), 'utf8'))
    return { versione: String(dati.versione || ''), tentativi: Number(dati.tentativi) || 0 }
  } catch {
    return { versione: '', tentativi: 0 }
  }
}

function segnaTentativo(versione) {
  const attuale = leggiTentativi()
  const tentativi = attuale.versione === versione ? attuale.tentativi + 1 : 1
  try {
    fs.writeFileSync(
      path.join(cartellaDati(), FILE_TENTATIVI),
      JSON.stringify({ versione, tentativi, ultimo: new Date().toISOString() }, null, 2),
    )
  } catch {
    /* ignora */
  }
  registra(`tentativo di installazione n. ${tentativi} per la versione ${versione}`)
  return tentativi
}

function azzeraTentativi() {
  try {
    fs.unlinkSync(path.join(cartellaDati(), FILE_TENTATIVI))
  } catch {
    /* non esiste: ok */
  }
}

/** Scarica, verifica e installa l'aggiornamento (l'app si chiude e riparte). */
async function installaAggiornamento() {
  if (!ultimoAggiornamento) throw new Error('Nessun aggiornamento da installare.')
  segnaTentativo(ultimoAggiornamento.versione)
  registra(`download avviato: versione ${ultimoAggiornamento.versione}`)
  aggiornaStato({ fase: 'download', percentuale: 0, messaggio: '' })
  const file = await agg.scaricaAggiornamento(ultimoAggiornamento, (p) => aggiornaStato({ percentuale: p }))
  registra(`download completato e impronta verificata: ${file}`)
  aggiornaStato({ fase: 'installazione', percentuale: 100 })
  agg.avviaSostituzione(file)
  registra('sostituzione avviata: il programma si chiude e riparte')
  // lascia il tempo all'interfaccia di mostrare il messaggio, poi esce
  setTimeout(() => {
    if (db) db.close()
    app.exit(0)
  }, 1200)
}

ipcMain.handle('agg:stato', () => {
  registra(`interfaccia: stato richiesto (supportato=${statoAgg.supportato}, fase=${statoAgg.fase})`)
  return { data: statoAgg, error: null }
})

// Nota: l'handler DEVE attendere il risultato e restituire solo valori semplici.
// (Restituire una Promise attraverso il canale la rende non trasferibile e la
// chiamata fallisce: l'avvio resterebbe appeso.)
ipcMain.handle('agg:controlla', async () => {
  try {
    const info = await controllaAggiornamenti()
    return {
      data: info ? { versione: info.versione, note: info.note, autoInstalla: info.autoInstalla !== false } : null,
      error: null,
    }
  } catch (e) {
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
})
ipcMain.handle('agg:installa', async () => {
  registra('interfaccia: installazione richiesta')
  try {
    await installaAggiornamento()
    return { data: null, error: null }
  } catch (e) {
    const messaggio = String((e && e.message) || e)
    registra(`installazione fallita: ${messaggio}`)
    aggiornaStato({ fase: 'errore', messaggio })
    return { data: null, error: { message: messaggio } }
  }
})

// ---------- finestra ----------
function creaFinestra() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'TR.A.V.I. - Tracciamento Attività e Verifica Immobili',
    backgroundColor: '#E6F0F8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  Menu.setApplicationMenu(null)

  // Diagnostica: tutto ciò che accade nella finestra finisce nel registro,
  // così un problema dell'interfaccia non resta invisibile.
  win.webContents.on('preload-error', (_e, percorso, errore) => {
    registra(`ERRORE nel ponte (preload ${percorso}): ${errore && errore.message}`)
  })
  win.webContents.on('console-message', (_e, livello, messaggio, riga, sorgente) => {
    if (livello >= 2) registra(`finestra [errore] ${messaggio} (${sorgente}:${riga})`)
    else if (/\[TRAVI\]/.test(String(messaggio))) registra(`finestra ${messaggio}`)
  })
  win.webContents.on('did-finish-load', () => registra('finestra: interfaccia caricata'))
  win.webContents.on('render-process-gone', (_e, dettagli) =>
    registra(`finestra terminata: ${dettagli && dettagli.reason}`),
  )

  void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  return win
}

// ---------- smoke test (verifica automatica senza finestra) ----------
// Il test NON tocca mai il database reale (travi.db): lavora su una copia
// usa e getta, così i dati dell'utente non corrono alcun rischio.
const FILE_TEST = '_collaudo.db'

function rimuoviDbTest() {
  for (const suffisso of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(path.join(cartellaDati(), FILE_TEST + suffisso))
    } catch {
      /* non esiste: ok */
    }
  }
}

function smoke() {
  const rapporto = {}
  try {
    rimuoviDbTest()
    apriDb(FILE_TEST) // database dedicato al collaudo
    rapporto.cartella_dati = cartellaDati()
    rapporto.database_di_collaudo = FILE_TEST
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

    // --- indirizzi mappa (indirizzo, coordinate, caratteri speciali)
    const finestra = urlMappa('Via Roma, 31, 33100 Udine', 'finestra')
    const browser = urlMappa('41.9028, 12.4964', 'browser')
    const finestraCoord = urlMappa('41.9028, 12.4964', 'finestra')
    rapporto.mappa_finestra_ok =
      finestra.includes('output=embed') && finestra.includes('iwloc=B') && finestra.includes('Via%20Roma')
    rapporto.mappa_browser_ok = browser.includes('maps/search') && browser.includes('41.9028%2C%2012.4964')
    // con le coordinate serve il prefisso loc: per ottenere il segnaposto
    rapporto.mappa_coordinate_con_segnaposto = finestraCoord.includes('loc%3A41.9028%2C12.4964')
    let mappaVuotaRespinta = false
    try {
      urlMappa('  ', 'finestra')
    } catch {
      mappaVuotaRespinta = true
    }
    rapporto.mappa_vuota_respinta = mappaVuotaRespinta
    rapporto.mappa_host_filtrati =
      hostAmmesso('https://www.google.com/maps') && !hostAmmesso('https://sito-esterno.example')

    // --- aggiornamenti: confronto versioni e script di sostituzione
    rapporto.versioni_ordinate =
      agg.confrontaVersioni('1.0.1', '1.0.0') === 1 &&
      agg.confrontaVersioni('1.0.0', '1.0.1') === -1 &&
      agg.confrontaVersioni('1.10.0', '1.9.9') === 1 &&
      agg.confrontaVersioni('v1.2.3', '1.2.3') === 0 &&
      agg.confrontaVersioni('2.0.0', '1.99.99') === 1
    rapporto.agg_disattivato_fuori_portable = agg.aggiornamentoSupportato() === false

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
      rapporto.mappa_finestra_ok &&
      rapporto.mappa_browser_ok &&
      rapporto.mappa_vuota_respinta &&
      rapporto.mappa_host_filtrati &&
      rapporto.mappa_coordinate_con_segnaposto &&
      rapporto.versioni_ordinate &&
      rapporto.preferenze.tema === 'bordeaux' &&
      rapporto.preferenze.per_pagina === '30' &&
      rapporto.dopo_delete === rapporto.immobili_iniziali
  } catch (e) {
    rapporto.ok = false
    rapporto.errore = String((e && e.stack) || e)
  }
  // chiude e cancella il database di collaudo
  try {
    if (db) db.close()
    db = null
    rimuoviDbTest()
    rapporto.db_collaudo_rimosso = true
  } catch {
    rapporto.db_collaudo_rimosso = false
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
  statoAgg.supportato = agg.aggiornamentoSupportato()
  statoAgg.versioneCorrente = app.getVersion()
  // se questa versione è quella che stavamo installando, l'aggiornamento è riuscito
  const inSospeso = leggiTentativi()
  if (inSospeso.versione && agg.confrontaVersioni(app.getVersion(), inSospeso.versione) >= 0) {
    registra(`aggiornamento alla ${inSospeso.versione} completato con successo`)
    azzeraTentativi()
  }
  registra(
    `avvio applicazione ${app.getVersion()} — aggiornamento ${statoAgg.supportato ? 'attivo' : 'non disponibile'} ` +
      `(eseguibile: ${agg.eseguibilePortable() || 'non portable'})`,
  )
  creaFinestra()
  // ricontrolla una volta all'ora, per accorgersi degli aggiornamenti
  // pubblicati mentre il programma è già aperto
  setInterval(() => {
    if (statoAgg.fase === 'inattivo' || statoAgg.fase === 'errore') void controllaAggiornamenti()
  }, 60 * 60 * 1000)
})

app.on('window-all-closed', () => {
  if (db) db.close()
  app.quit()
})
