import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { dbLocale } from './lib/db'
import PrimoAvvioPage from './pages/PrimoAvvioPage'
import PrimaSistemazionePage from './pages/PrimaSistemazionePage'
import ArchivioGatePage from './pages/ArchivioGatePage'
import { supportaArchivioFile, statoArchivioFile } from './lib/dbBrowser'
import { PreferenzeProvider } from './hooks/usePreferenze'
import { SelezioneProvider } from './hooks/useSelezione'
import { ImmobiliProvider } from './hooks/useImmobili'
import { MappaProvider } from './hooks/useMappa'
import { ToastProvider } from './hooks/useToast'
import Layout from './components/Layout'
import GestoreAggiornamenti from './components/GestoreAggiornamenti'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ImmobiliPage from './pages/ImmobiliPage'
import SchedaImmobilePage from './pages/SchedaImmobilePage'
import BuildingManagerPage from './pages/BuildingManagerPage'
import UtentiPage from './pages/UtentiPage'

export default function App() {
  // L'aggiornamento viene prima di tutto: login e dati arrivano dopo.
  return (
    <GestoreAggiornamenti>
      <ToastProvider>
        <AuthProvider>
          <PreferenzeProvider>
            <SelezioneProvider>
              <Contenuto />
            </SelezioneProvider>
          </PreferenzeProvider>
        </AuthProvider>
      </ToastProvider>
    </GestoreAggiornamenti>
  )
}

function Contenuto() {
  const { caricamento, utente } = useAuth()
  // al primo accesso in assoluto si propone di creare i collegamenti
  const [chiediCollegamenti, setChiediCollegamenti] = useState(false)
  // se il programma gira da una cartella qualsiasi, prima si sistema
  const [sistemazione, setSistemazione] = useState<{ serve: boolean; destinazione: string } | null>(null)
  // versione browser: finché manca un file archivio, prima si chiede dove salvarlo
  const [gateArchivio, setGateArchivio] = useState<boolean | null>(supportaArchivioFile() ? null : false)

  useEffect(() => {
    void dbLocale.sistemazione.stato().then(({ data }) =>
      setSistemazione({ serve: Boolean(data?.serve), destinazione: data?.destinazione ?? '' }),
    )
  }, [])

  useEffect(() => {
    if (!utente || !supportaArchivioFile()) return
    let vivo = true
    void statoArchivioFile().then((s) => {
      if (!vivo) return
      // regola fissa: senza un file archivio collegato non si entra
      setGateArchivio(s.supportato && !s.collegato)
    })
    return () => {
      vivo = false
    }
  }, [utente])

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

  // versione browser: prima della home serve decidere dove vive l'archivio
  if (gateArchivio === null) {
    return <div className="flex min-h-full items-center justify-center text-cielo-500">Caricamento…</div>
  }
  if (gateArchivio) return <ArchivioGatePage onFine={() => setGateArchivio(false)} />

  return (
    <ImmobiliProvider>
      <MappaProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/immobili" element={<ImmobiliPage />} />
              <Route path="/immobile" element={<SchedaImmobilePage />} />
              <Route path="/bm" element={<BuildingManagerPage />} />
              <Route path="/utenti" element={<UtentiPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </MappaProvider>
    </ImmobiliProvider>
  )
}
