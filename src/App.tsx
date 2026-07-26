import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SelezioneProvider } from './hooks/useSelezione'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ImmobiliPage from './pages/ImmobiliPage'

export default function App() {
  return (
    <HashRouter>
      <SelezioneProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/immobili" element={<ImmobiliPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SelezioneProvider>
    </HashRouter>
  )
}
