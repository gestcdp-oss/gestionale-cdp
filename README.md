# TR.A.V.I. — Tracciamento Attività Verifica Immobili

Gestionale aziendale interno (nome in codice del progetto: `gestionale-cdp`).
Accesso riservato tramite login Google + whitelist di email autorizzate.

## Stack
- Frontend: React 18 + Vite 5 + TypeScript + Tailwind
- Backend/DB: Supabase (PostgreSQL)
- Auth: Supabase Auth con provider Google
- Hosting: GitHub Pages (deploy automatico ad ogni push su `main`)

## Modello di sicurezza (importante)
Nessun dato e leggibile senza essere loggati **e** presenti nella whitelist:
- ogni tabella ha la **RLS** attiva;
- le policy consentono l'accesso solo se `is_autorizzato()` (email nella tabella `utenti_autorizzati`, `attivo = true`);
- la chiave `anon` da sola (senza sessione Google valida) non restituisce alcun dato.

La chiave `anon` e l'URL del progetto sono **pubblici** per definizione (finiscono nel bundle):
la protezione e nel database, non nella segretezza delle chiavi. I segreti veri
(Personal Access Token, service_role, client secret Google) non stanno **mai** nel repo.

## Sviluppo in locale
```bash
npm install
cp .env.local.example .env.local   # e compila i valori
npm run dev
```

## Amministrazione database
Le modifiche allo schema si applicano via Management API (gira come admin, bypassa la RLS):
```bash
npm run db:schema                       # applica supabase/schema.sql
node scripts/run-sql.mjs "SELECT 1"     # query ad-hoc
```

## Deploy
Push su `main` -> GitHub Actions builda e pubblica su GitHub Pages.
