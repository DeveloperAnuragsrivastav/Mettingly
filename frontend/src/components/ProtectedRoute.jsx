import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, allowedTypes }) {
  const { identity, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!identity || identity.type === 'unauthorized') {
    return <Navigate to="/login" replace />
  }

  if (allowedTypes && !allowedTypes.includes(identity.type)) {
    // If they are authenticated but wrong type, send them to their correct home
    if (identity.type === 'platform_admin') return <Navigate to="/platform" replace />
    return <Navigate to="/dashboard" replace />
  }

  return children
}
