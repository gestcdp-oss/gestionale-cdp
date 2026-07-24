import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import BannerAggiornamento from './components/BannerAggiornamento'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ImmobiliPage from './pages/ImmobiliPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/immobili" element={<ImmobiliPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BannerAggiornamento />
    </AuthProvider>
  )
}
