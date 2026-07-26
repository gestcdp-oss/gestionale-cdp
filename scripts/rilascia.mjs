// Pubblica una nuova versione di TR.A.V.I. su GitHub Releases.
// Da quel momento tutte le installazioni la scaricano e si aggiornano da sole.
//
// Uso:
//   npm run rilascia            → alza l'ultimo numero (1.0.0 → 1.0.1)
//   npm run rilascia 1.1.0      → versione indicata
//   npm run rilascia 1.1.0 "Testo delle note"
//
// Richiede GITHUB_TOKEN in .env.local (file non versionato).

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import crypto from 'node:crypto'

const REPO = 'travi-oss/travi-gest'
const EXE = 'release/TRAVI.exe'
const MANIFESTO = 'release/aggiornamento.json'

function caricaEnv(file) {
  if (!existsSync(file)) return
  for (const riga of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = riga.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
caricaEnv('.env')
caricaEnv('.env.local')

const TOKEN = process.env.GITHUB_TOKEN
if (!TOKEN) {
  console.error('Manca GITHUB_TOKEN in .env.local: impossibile pubblicare.')
  process.exit(1)
}

// ---------------------------------------------------------------- versione
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const argomento = process.argv[2]
const note = process.argv[3] || ''

function versioneSuccessiva(v) {
  const p = String(v).split('.').map((n) => parseInt(n, 10) || 0)
  p[2] = (p[2] || 0) + 1
  return p.join('.')
}

const nuovaVersione = argomento && /^\d+\.\d+\.\d+$/.test(argomento) ? argomento : versioneSuccessiva(pkg.version)
console.log(`\n▶ Rilascio ${pkg.version} → ${nuovaVersione}\n`)

// avviso se ci sono modifiche non ancora salvate su GitHub
try {
  const sporco = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
  if (sporco) console.log('⚠️  Ci sono modifiche non committate: verranno incluse nel pacchetto ma non nel repository.\n')
} catch {
  /* non è un repo git: ok */
}

pkg.version = nuovaVersione
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')

// ---------------------------------------------------------------- pacchetto
console.log('▶ Generazione del pacchetto (chiude e riapre l\'app)…')
execSync('npm run dist', { stdio: 'inherit' })

if (!existsSync(EXE)) {
  console.error(`Pacchetto non trovato: ${EXE}`)
  process.exit(1)
}

// ---------------------------------------------------------------- controllo dati
// L'eseguibile finisce su un repository pubblico: non deve contenere NESSUN dato
// aziendale. Qui si controlla il pacchetto prima di pubblicarlo.
const ASAR = 'release/win-unpacked/resources/app.asar'
if (existsSync(ASAR)) {
  const contenuto = readFileSync(ASAR)
  const spie = ['seed-immobili', 'EX MT NAPOLI', 'FINTECNA', 'CDP Imm in liq', 'marabelli.s@gmail.com']
  const trovate = spie.filter((s) => contenuto.includes(Buffer.from(s, 'utf8')) && s !== 'marabelli.s@gmail.com')
  // l'email dell'amministratore permanente è parte del codice: non è un dato aziendale
  if (trovate.length) {
    console.error(`\n⛔ PUBBLICAZIONE ANNULLATA: il pacchetto contiene dati (${trovate.join(', ')}).`)
    console.error('   Chi scarica l\'eseguibile non deve ricevere alcun dato: correggere e riprovare.\n')
    process.exit(1)
  }
  console.log('▶ Controllo dati nel pacchetto: nessun dato aziendale incluso ✔')
} else {
  console.error(`⚠️  Impossibile controllare ${ASAR}: pubblicazione annullata per prudenza.`)
  process.exit(1)
}

const binario = readFileSync(EXE)
const sha256 = crypto.createHash('sha256').update(binario).digest('hex')
const manifesto = {
  version: nuovaVersione,
  sha256,
  size: binario.length,
  data: new Date().toISOString(),
  note,
}
writeFileSync(MANIFESTO, JSON.stringify(manifesto, null, 2))
console.log(`\n▶ Impronta SHA-256: ${sha256}\n▶ Dimensione: ${(binario.length / 1048576).toFixed(1)} MB\n`)

// ---------------------------------------------------------------- GitHub
const intestazioni = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'TRAVI-release',
}

async function api(percorso, opzioni = {}) {
  const r = await fetch(`https://api.github.com${percorso}`, { ...opzioni, headers: { ...intestazioni, ...opzioni.headers } })
  const testo = await r.text()
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${testo.slice(0, 300)}`)
  return testo ? JSON.parse(testo) : null
}

const tag = `v${nuovaVersione}`

// se il tag esiste già, si riusa la release (asset sostituiti)
let release = null
try {
  release = await api(`/repos/${REPO}/releases/tags/${tag}`)
  console.log(`▶ Release ${tag} già presente: sostituisco i file.`)
} catch {
  console.log(`▶ Creazione release ${tag}…`)
  release = await api(`/repos/${REPO}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tag,
      name: `TR.A.V.I. ${nuovaVersione}`,
      body: note || `Versione ${nuovaVersione}`,
      draft: false,
      prerelease: false,
    }),
  })
}

// rimuove eventuali file omonimi già caricati
for (const a of release.assets || []) {
  if (a.name === 'TRAVI.exe' || a.name === 'aggiornamento.json') {
    await api(`/repos/${REPO}/releases/assets/${a.id}`, { method: 'DELETE' })
  }
}

async function carica(nome, contenuto, tipo) {
  console.log(`▶ Caricamento ${nome} (${(contenuto.length / 1048576).toFixed(1)} MB)…`)
  const r = await fetch(
    `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(nome)}`,
    { method: 'POST', headers: { ...intestazioni, 'Content-Type': tipo, 'Content-Length': String(contenuto.length) }, body: contenuto },
  )
  if (!r.ok) throw new Error(`Caricamento ${nome} non riuscito: ${r.status} ${await r.text()}`)
}

await carica('TRAVI.exe', binario, 'application/octet-stream')
await carica('aggiornamento.json', Buffer.from(JSON.stringify(manifesto, null, 2)), 'application/json')

console.log(`\n✅ Versione ${nuovaVersione} pubblicata.`)
console.log(`   https://github.com/${REPO}/releases/tag/${tag}`)
console.log('   Le installazioni la scaricheranno da sole al prossimo avvio.\n')
