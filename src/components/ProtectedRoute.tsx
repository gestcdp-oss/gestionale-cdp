import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, session, profilo } = useAuth()

  if (loading) {
    return <div className="flex min-h-full items-center justify-center text-cielo-500">Caricamento…</div>
  }
  if (!session || !profilo) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
