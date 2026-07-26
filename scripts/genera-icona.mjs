// Genera build/icon.ico (icona di TRAVI.exe) a partire da public/logo.svg.
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const svg = readFileSync('public/logo.svg', 'utf8')
const misure = [256, 128, 64, 48, 32, 16]
const pngs = misure.map((m) => new Resvg(svg, { fitTo: { mode: 'width', value: m } }).render().asPng())

mkdirSync('build', { recursive: true })
const ico = await pngToIco(pngs)
writeFileSync('build/icon.ico', ico)
console.log(`build/icon.ico generato (${ico.length} byte)`)
