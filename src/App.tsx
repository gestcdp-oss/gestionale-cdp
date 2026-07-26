import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { PreferenzeProvider } from './hooks/usePreferenze'
import { SelezioneProvider } from './hooks/useSelezione'
import Layout from './components/Layout'
import GestoreAggiornamenti from './components/GestoreAggiornamenti'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ImmobiliPage from './pages/ImmobiliPage'
import UtentiPage from './pages/UtentiPage'

export default function App() {
  // L'aggiornamento viene prima di tutto: login e dati arrivano dopo.
  return (
    <GestoreAggiornamenti>
      <AuthProvider>
        <PreferenzeProvider>
          <SelezioneProvider>
            <Contenuto />
          </SelezioneProvider>
        </PreferenzeProvider>
      </AuthProvider>
    </GestoreAggiornamenti>
  )
}

function Contenuto() {
  const { caricamento, utente } = useAuth()

  if (caricamento) {
    return <div className="flex min-h-full items-center justify-center text-cielo-500">Caricamento…</div>
  }

  // Senza login non si vede nulla dei dati.
  if (!utente) return <LoginPage />

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/immobili" element={<ImmobiliPage />} />
          <Route path="/utenti" element={<UtentiPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
