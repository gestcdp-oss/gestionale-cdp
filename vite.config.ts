import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Nome del repository GitHub: determina il base path su GitHub Pages
// (https://gestcdp-oss.github.io/gestionale-cdp/)
const REPO = 'gestionale-cdp'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? `/${REPO}/` : '/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
}))
