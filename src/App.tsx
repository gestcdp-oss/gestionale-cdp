import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { dbLocale } from './lib/db'
import PrimoAvvioPage from './pages/PrimoAvvioPage'
import PrimaSistemazionePage from './pages/PrimaSistemazionePage'
import { PreferenzeProvider } from './hooks/usePreferenze'
import { SelezioneProvider } from './hooks/useSelezione'
import { ImmobiliProvider } from './hooks/useImmobili'
import Layout from './components/Layout'
import GestoreAggiornamenti from './components/GestoreAggiornamenti'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ImmobiliPage from './pages/ImmobiliPage'
import SchedaImmobilePage from './pages/SchedaImmobilePage'
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
  // al primo accesso in assoluto si propone di creare i collegamenti
  const [chiediCollegamenti, setChiediCollegamenti] = useState(false)
  // se il programma gira da una cartella qualsiasi, prima si sistema
  const [sistemazione, setSistemazione] = useState<{ serve: boolean; destinazione: string } | null>(null)

  useEffect(() => {
    void dbLocale.sistemazione.stato().then(({ data }) =>
      setSistemazione({ serve: Boolean(data?.serve), destinazione: data?.destinazione ?? '' }),
    )
  }, [])

  useEffect(() => {
    if (!utente) return
    void dbLocale.collegamenti.stato().then(({ data }) => {
      if (data && !data.giaChiesto) setChiediCollegamenti(true)
    })
  }, [utente])

  if (caricamento || sistemazione === null) {
    return <div className="flex min-h-full items-center justify-center text-cielo-500">Caricamento…</div>
  }

  // prima di ogni altra cosa: sistemazione del programma sul computer
  if (sistemazione.serve) {
    return (
      <PrimaSistemazionePage
        destinazione={sistemazione.destinazione}
        onRifiuta={() => setSistemazione({ serve: false, destinazione: sistemazione.destinazione })}
      />
    )
  }

  // Senza login non si vede nulla dei dati.
  if (!utente) return <LoginPage />

  if (chiediCollegamenti) return <PrimoAvvioPage onFine={() => setChiediCollegamenti(false)} />

  return (
    <ImmobiliProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/immobili" element={<ImmobiliPage />} />
            <Route path="/immobile" element={<SchedaImmobilePage />} />
            <Route path="/utenti" element={<UtentiPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ImmobiliProvider>
  )
}
