// TR.A.V.I. — aggiornamento automatico dell'eseguibile portable.
//
// Come funziona:
//  1. l'app chiede a GitHub qual è l'ultima versione pubblicata (Releases);
//  2. se è più recente, scarica il nuovo TRAVI.exe in una cartella di appoggio;
//  3. verifica l'impronta SHA-256 dichiarata nella release: se non combacia, annulla;
//  4. scrive uno script che attende la chiusura dell'app, sostituisce il file
//     (tenendo una copia di sicurezza) e riavvia il programma.
//
// Regole di sicurezza:
//  - senza impronta SHA-256 valida NON si installa nulla;
//  - se qualcosa va storto si torna sempre all'eseguibile precedente;
//  - se GitHub non è raggiungibile l'app parte normalmente (mai bloccare il lavoro).

const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')

const REPO = 'travi-oss/travi-gest'
const NOME_ASSET = 'TRAVI.exe'
const NOME_MANIFESTO = 'aggiornamento.json'
const TIMEOUT_RETE = 15000

// ---------------------------------------------------------------- utilità

/** Confronta due versioni tipo "1.2.10". Ritorna 1 se a > b, -1 se a < b, 0 se uguali. */
function confrontaVersioni(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

/** GET HTTPS con redirect, timeout e risposta come testo. */
function scaricaTesto(url, intestazioni = {}, redirect = 0) {
  return new Promise((risolvi, rifiuta) => {
    if (redirect > 5) return rifiuta(new Error('Troppi reindirizzamenti.'))
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'TRAVI-updater', Accept: 'application/vnd.github+json', ...intestazioni } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return risolvi(scaricaTesto(res.headers.location, intestazioni, redirect + 1))
        }
        if (res.statusCode !== 200) {
          res.resume()
          return rifiuta(new Error(`Risposta ${res.statusCode} da GitHub.`))
        }
        let dati = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (dati += c))
        res.on('end', () => risolvi(dati))
      },
    )
    req.setTimeout(TIMEOUT_RETE, () => req.destroy(new Error('Tempo scaduto nel contattare GitHub.')))
    req.on('error', rifiuta)
  })
}

/** Scarica un file su disco calcolando l'impronta SHA-256 e riportando l'avanzamento. */
function scaricaFile(url, destinazione, onProgresso, redirect = 0) {
  return new Promise((risolvi, rifiuta) => {
    if (redirect > 5) return rifiuta(new Error('Troppi reindirizzamenti.'))
    const req = https.get(url, { headers: { 'User-Agent': 'TRAVI-updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return risolvi(scaricaFile(res.headers.location, destinazione, onProgresso, redirect + 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return rifiuta(new Error(`Download non riuscito (risposta ${res.statusCode}).`))
      }
      const totale = parseInt(res.headers['content-length'] || '0', 10)
      let ricevuti = 0
      const hash = crypto.createHash('sha256')
      const out = fs.createWriteStream(destinazione)
      res.on('data', (pezzo) => {
        ricevuti += pezzo.length
        hash.update(pezzo)
        if (onProgresso && totale) onProgresso(Math.min(99, Math.round((ricevuti / totale) * 100)))
      })
      res.pipe(out)
      out.on('finish', () => out.close(() => risolvi({ sha256: hash.digest('hex'), byte: ricevuti })))
      out.on('error', rifiuta)
      res.on('error', rifiuta)
    })
    req.setTimeout(TIMEOUT_RETE, () => req.destroy(new Error('Tempo scaduto durante il download.')))
    req.on('error', rifiuta)
  })
}

// ---------------------------------------------------------------- stato app

/** Percorso dell'eseguibile portable da sostituire (null se non siamo in portable). */
function eseguibilePortable() {
  return process.env.PORTABLE_EXECUTABLE_FILE || null
}

function aggiornamentoSupportato() {
  return Boolean(eseguibilePortable())
}

// ---------------------------------------------------------------- controllo

/**
 * Chiede a GitHub l'ultima versione pubblicata.
 * Ritorna { versione, note, urlExe, sha256, byte } oppure null se non c'è nulla di nuovo.
 */
async function cercaAggiornamento(versioneCorrente) {
  const testo = await scaricaTesto(`https://api.github.com/repos/${REPO}/releases/latest`)
  const release = JSON.parse(testo)
  const versione = String(release.tag_name || '').replace(/^v/i, '')
  if (!versione) throw new Error('La release non indica una versione.')
  if (confrontaVersioni(versione, versioneCorrente) <= 0) return null

  const assets = Array.isArray(release.assets) ? release.assets : []
  const exe = assets.find((a) => a.name === NOME_ASSET)
  const manifesto = assets.find((a) => a.name === NOME_MANIFESTO)
  if (!exe) throw new Error(`La release ${versione} non contiene ${NOME_ASSET}.`)
  if (!manifesto) throw new Error(`La release ${versione} non contiene ${NOME_MANIFESTO} (impronta di sicurezza).`)

  const datiManifesto = JSON.parse(await scaricaTesto(manifesto.browser_download_url, { Accept: '*/*' }))
  const sha256 = String(datiManifesto.sha256 || '').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Impronta di sicurezza assente o non valida.')

  return {
    versione,
    note: String(release.body || '').trim(),
    urlExe: exe.browser_download_url,
    byte: exe.size || 0,
    sha256,
  }
}

// ---------------------------------------------------------------- installazione

function cartellaAppoggio() {
  const base = path.dirname(eseguibilePortable() || process.execPath)
  const dir = path.join(base, 'aggiornamento')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Scarica e verifica il nuovo eseguibile. Ritorna il percorso del file scaricato.
 * Non modifica nulla dell'installazione esistente.
 */
async function scaricaAggiornamento(info, onProgresso) {
  if (!aggiornamentoSupportato()) throw new Error('Aggiornamento automatico non disponibile in questa modalità.')
  const dir = cartellaAppoggio()
  const destinazione = path.join(dir, `TRAVI-${info.versione}.exe`)
  try {
    fs.unlinkSync(destinazione)
  } catch {
    /* non esiste: ok */
  }
  const esito = await scaricaFile(info.urlExe, destinazione, onProgresso)
  if (esito.sha256.toLowerCase() !== info.sha256.toLowerCase()) {
    try {
      fs.unlinkSync(destinazione)
    } catch {
      /* ignora */
    }
    throw new Error('File scaricato non integro (impronta diversa): aggiornamento annullato.')
  }
  if (info.byte && esito.byte !== info.byte) {
    // dimensione diversa da quella dichiarata: meglio non rischiare
    try {
      fs.unlinkSync(destinazione)
    } catch {
      /* ignora */
    }
    throw new Error('File scaricato incompleto: aggiornamento annullato.')
  }
  return destinazione
}

/**
 * Crea lo script che sostituisce l'eseguibile e riavvia il programma.
 * Lo script attende la chiusura dell'app, tiene una copia di sicurezza del
 * vecchio file e la ripristina se qualcosa va storto.
 */
function creaScriptSostituzione(fileNuovo) {
  const bersaglio = eseguibilePortable()
  const dir = cartellaAppoggio()
  const script = path.join(dir, 'sostituisci.cmd')
  const backup = `${bersaglio}.precedente`
  const registro = path.join(dir, 'registro-sostituzione.txt')
  const contenuto = `@echo off
setlocal
set "BERSAGLIO=${bersaglio}"
set "NUOVO=${fileNuovo}"
set "BACKUP=${backup}"
set "LOG=${registro}"

echo [%DATE% %TIME%] sostituzione avviata >> "%LOG%"

rem attende la chiusura dell'app (max 60 secondi, poi la forza)
set /a TENTATIVI=0
:attesa
tasklist /FI "IMAGENAME eq TRAVI.exe" /NH 2>nul | find /I "TRAVI.exe" >nul
if errorlevel 1 goto libero
set /a TENTATIVI+=1
if %TENTATIVI% GEQ 60 (
  echo [%TIME%] chiusura forzata >> "%LOG%"
  taskkill /F /IM TRAVI.exe >nul 2>&1
  timeout /t 2 /nobreak >nul
  goto libero
)
timeout /t 1 /nobreak >nul
goto attesa

:libero
rem Windows può tenere bloccato l'eseguibile ancora per qualche istante dopo la
rem chiusura: si riprova più volte invece di arrendersi al primo tentativo.
timeout /t 2 /nobreak >nul
set /a PROVE=0

:riprova
if exist "%BACKUP%" del /f /q "%BACKUP%" >nul 2>&1
move /y "%BERSAGLIO%" "%BACKUP%" >nul 2>&1
if not exist "%BERSAGLIO%" goto metti_nuovo
set /a PROVE+=1
echo [%TIME%] file ancora bloccato (tentativo %PROVE%) >> "%LOG%"
if %PROVE% LSS 25 (
  timeout /t 1 /nobreak >nul
  goto riprova
)
echo [%TIME%] RINUNCIA: impossibile sostituire, riavvio la versione attuale >> "%LOG%"
goto riavvia

:metti_nuovo
move /y "%NUOVO%" "%BERSAGLIO%" >nul 2>&1
if not exist "%BERSAGLIO%" (
  echo [%TIME%] copia nuova non riuscita: ripristino la precedente >> "%LOG%"
  move /y "%BACKUP%" "%BERSAGLIO%" >nul 2>&1
) else (
  echo [%TIME%] sostituzione completata >> "%LOG%"
)

:riavvia
start "" "%BERSAGLIO%"
timeout /t 3 /nobreak >nul
del /f /q "%BACKUP%" >nul 2>&1
del /f /q "%~f0" >nul 2>&1
`
  fs.writeFileSync(script, contenuto, 'utf8')
  return script
}

/** Avvia lo script di sostituzione (l'app deve chiudersi subito dopo). */
function avviaSostituzione(fileNuovo) {
  const script = creaScriptSostituzione(fileNuovo)
  const p = spawn('cmd.exe', ['/c', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: os.tmpdir(),
  })
  p.unref()
}

module.exports = {
  REPO,
  confrontaVersioni,
  aggiornamentoSupportato,
  eseguibilePortable,
  cercaAggiornamento,
  scaricaAggiornamento,
  creaScriptSostituzione,
  avviaSostituzione,
  cartellaAppoggio,
}
