#!/usr/bin/env node
// Esegue SQL sul database Supabase via connessione Postgres diretta (pooler).
// Gira come ruolo 'postgres' (bypassa la RLS): usarlo solo per migrazioni/manutenzione.
//
// Uso:
//   node scripts/run-sql.mjs "SELECT 1"
//   node scripts/run-sql.mjs --file supabase/schema.sql
//   echo "SELECT now()" | node scripts/run-sql.mjs --stdin
//
// Config (da .env.local, gitignored):
//   SUPABASE_DB_HOST, SUPABASE_DB_PORT, SUPABASE_DB_USER, SUPABASE_DB_PASSWORD, SUPABASE_DB_NAME
//   (in alternativa DATABASE_URL)

import { readFileSync } from 'node:fs'
import pg from 'pg'

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    /* file assente: ok */
  }
}

loadEnv('.env')
loadEnv('.env.local')

const cfg = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.SUPABASE_DB_HOST,
      port: Number(process.env.SUPABASE_DB_PORT || 5432),
      user: process.env.SUPABASE_DB_USER,
      password: process.env.SUPABASE_DB_PASSWORD,
      database: process.env.SUPABASE_DB_NAME || 'postgres',
    }

if (!cfg.connectionString && (!cfg.host || !cfg.user || !cfg.password)) {
  console.error('Config DB mancante: imposta SUPABASE_DB_* (o DATABASE_URL) in .env.local')
  process.exit(1)
}
cfg.ssl = { rejectUnauthorized: false }

const args = process.argv.slice(2)
let sql = ''
if (args[0] === '--file') sql = readFileSync(args[1], 'utf8')
else if (args[0] === '--stdin') sql = readFileSync(0, 'utf8')
else sql = args.filter((a) => a !== '--confirm-destructive').join(' ')

if (!sql.trim()) {
  console.error('Errore: nessun SQL fornito.')
  process.exit(1)
}

const distruttivo = /\b(drop|truncate|delete|update)\b/i.test(sql)
if (distruttivo && !/\bwhere\b/i.test(sql) && !args.includes('--confirm-destructive')) {
  console.error('SQL potenzialmente distruttivo senza WHERE: aggiungi --confirm-destructive se sei sicuro.')
  process.exit(1)
}

const { Client } = pg
const client = new Client(cfg)
try {
  await client.connect()
  const res = await client.query(sql)
  const results = Array.isArray(res) ? res : [res]
  for (const r of results) {
    if (r.rows && r.rows.length) console.log(JSON.stringify(r.rows, null, 2))
    else console.log(`${r.command || 'OK'}${r.rowCount != null ? ` (${r.rowCount})` : ''}`)
  }
} catch (e) {
  console.error('Errore SQL:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
