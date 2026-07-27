import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

// Base relativa: lo stesso identico build funziona sia dentro TRAVI.exe
// (file://) sia pubblicato sul web in una sottocartella (GitHub Pages).
export default defineConfig({
  plugins: [
    react(),
    {
      // version.json accanto all'app: nel browser serve al pulsante della
      // versione per capire se in rete c'è una versione più recente.
      name: 'scrivi-version-json',
      closeBundle() {
        try {
          mkdirSync(path.resolve(__dirname, 'dist'), { recursive: true })
          writeFileSync(
            path.resolve(__dirname, 'dist', 'version.json'),
            JSON.stringify({ version: pkg.version }),
          )
        } catch {
          /* ignora */
        }
      },
    },
  ],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
