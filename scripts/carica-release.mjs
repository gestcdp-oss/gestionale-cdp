// Carica su GitHub un pacchetto GIÀ COMPILATO, senza ricompilare nulla.
// Serve quando l'app è aperta e non la si vuole chiudere (es. per mostrare il
// banner di aggiornamento mentre si lavora).
//
// Uso: node scripts/carica-release.mjs <percorso-exe> <versione> ["note"]

import { readFileSync, existsSync } from 'node:fs'
import crypto from 'node:crypto'

const REPO = 'travi-oss/travi-gest'

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
const [exePath, versione, note = ''] = process.argv.slice(2)
if (!TOKEN || !exePath || !versione) {
  console.error('Uso: node scripts/carica-release.mjs <percorso-exe> <versione> ["note"]')
  process.exit(1)
}

const binario = readFileSync(exePath)
const sha256 = crypto.createHash('sha256').update(binario).digest('hex')
const manifesto = { version: versione, sha256, size: binario.length, data: new Date().toISOString(), note }
console.log(`▶ ${exePath} — ${(binario.length / 1048576).toFixed(1)} MB — impronta ${sha256.slice(0, 16)}…`)

const intestazioni = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'TRAVI-release',
}

async function api(percorso, opzioni = {}) {
  const r = await fetch(`https://api.github.com${percorso}`, { ...opzioni, headers: { ...intestazioni, ...opzioni.headers } })
  const testo = await r.text()
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${testo.slice(0, 200)}`)
  return testo ? JSON.parse(testo) : null
}

const tag = `v${versione}`
let release
try {
  release = await api(`/repos/${REPO}/releases/tags/${tag}`)
} catch {
  release = await api(`/repos/${REPO}/releases`, {
    method: 'POST',
    body: JSON.stringify({ tag_name: tag, name: `TR.A.V.I. ${versione}`, body: note || `Versione ${versione}` }),
  })
}
const NOME_ASSET = 'TRAVI-Installa.exe'
for (const a of release.assets || []) {
  if (a.name === NOME_ASSET || a.name === 'TRAVI.exe' || a.name === 'aggiornamento.json') {
    await api(`/repos/${REPO}/releases/assets/${a.id}`, { method: 'DELETE' })
  }
}

async function carica(nome, contenuto, tipo) {
  const r = await fetch(
    `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(nome)}`,
    { method: 'POST', headers: { ...intestazioni, 'Content-Type': tipo }, body: contenuto },
  )
  if (!r.ok) throw new Error(`Caricamento ${nome} fallito: ${r.status}`)
  console.log(`▶ caricato ${nome}`)
}

await carica(NOME_ASSET, binario, 'application/octet-stream')
await carica('aggiornamento.json', Buffer.from(JSON.stringify(manifesto, null, 2)), 'application/json')
console.log(`\n✅ Versione ${versione} pubblicata (app non toccata).`)
