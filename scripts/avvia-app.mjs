// Riavvia TRAVI.exe al termine della rigenerazione del pacchetto.
// REGOLA FISSA del progetto: ogni modifica che comporta la chiusura dell'app
// deve terminare con l'app riaperta sulla versione nuova.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

// dopo il passaggio al programma di installazione, la copia usabile per le
// prove è quella "a cartella" (win-unpacked); si tiene il vecchio percorso
// come alternativa per le installazioni portable ancora in giro
const candidati = [
  path.resolve('release', 'win-unpacked', 'TRAVI.exe'),
  path.resolve('release', 'TRAVI.exe'),
]
const exe = candidati.find((p) => existsSync(p))

if (!exe) {
  console.log('TRAVI.exe non trovato in release/: riavvio saltato.')
} else {
  const p = spawn(exe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) })
  p.unref()
  console.log('TRAVI.exe riavviato con la versione aggiornata.')
}
