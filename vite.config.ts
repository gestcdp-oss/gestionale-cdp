import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// Nome del repository GitHub: determina il base path su GitHub Pages
// (https://gestcdp-oss.github.io/gestionale-cdp/)
const REPO = 'gestionale-cdp'

// Versione dell'app = short SHA del commit. In CI arriva da GITHUB_SHA,
// in locale da git. Serve al controllo "nuova versione disponibile".
function versioneApp(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return String(Date.now())
  }
}

export default defineConfig(({ command }) => {
  const versione = versioneApp()
  return {
    base: command === 'build' ? `/${REPO}/` : '/',
    define: {
      __APP_VERSION__: JSON.stringify(versione),
    },
    plugins: [
      react(),
      {
        // Scrive dist/version.json ad ogni build: il client lo confronta
        // con la versione "cotta" nel bundle per capire se c'e stato un deploy.
        name: 'scrivi-version-json',
        closeBundle() {
          try {
            writeFileSync(
              path.resolve(__dirname, 'dist', 'version.json'),
              JSON.stringify({ version: versione }),
            )
          } catch {
            /* ignora */
          }
        },
      },
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
  }
})
