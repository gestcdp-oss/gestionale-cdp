// Genera build/icon.ico (icona di TRAVI.exe).
// Usa build/icona.svg (versione dedicata, soggetto grande e leggibile anche
// nelle dimensioni piccole); in mancanza ripiega sul logo dell'app.

import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const sorgente = existsSync('build/icona.svg') ? 'build/icona.svg' : 'public/logo.svg'
const svg = readFileSync(sorgente, 'utf8')

// Windows sceglie la misura in base al contesto (desktop, barra, Alt+Tab).
const misure = [256, 128, 96, 64, 48, 32, 24, 16]
const pngs = misure.map((m) => new Resvg(svg, { fitTo: { mode: 'width', value: m } }).render().asPng())

mkdirSync('build', { recursive: true })
const ico = await pngToIco(pngs)
writeFileSync('build/icon.ico', ico)
console.log(`build/icon.ico generato da ${sorgente} (${misure.join(', ')} px — ${ico.length} byte)`)

// icone PNG per la versione browser (manifest dell'app installabile)
for (const m of [192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: m } }).render().asPng()
  writeFileSync(`public/icona-${m}.png`, png)
}
console.log('public/icona-192.png e public/icona-512.png generate')
