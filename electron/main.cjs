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
  // qualunque errore imprevisto non deve lasciare il processo appeso
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
      return { data: null, error: { code: '23505', message: 'Asset o Denominazione già presenti.' } }
    }
    return { data: null, error: { message: String((e && e.message) || e) } }
  }
}

// ---------- IPC: immobili ----------
ipcMain.handle('immobili:list', () =>
  rispondi(() =>
    db.prepare('select id, asset, denominazione, portafoglio, localizzazione, creato_il from immobili').all(),
  ),
)

ipcMain.handle('immobili:insert', (_ev, r) =>
  rispondi(() => {
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
    const id = crypto.randomUUID()
    const marca = 'SMOKE-' + id.slice(0, 8)
    db.prepare('insert into immobili (id, asset, denominazione) values (?, ?, ?)').run(id, marca, 'PROVA ' + marca)
    db.prepare("update immobili set localizzazione = 'test' where id = ?").run(id)
    rapporto.dopo_insert = db.prepare('select count(*) as n from immobili').get().n
    db.prepare('delete from immobili where id = ?').run(id)
    rapporto.dopo_delete = db.prepare('select count(*) as n from immobili').get().n
    rapporto.ok = true
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
