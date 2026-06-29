import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthCallback() {
  const { identity, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading) {
      if (!identity) {
        // Not authenticated at all
        navigate('/login', { replace: true })
      } else if (identity.type === 'unauthorized') {
        // Authenticated but no linked profile in members or platform_admins
        navigate('/unauthorized', { replace: true })
      } else if (identity.type === 'platform_admin') {
        // Platform Admin
        navigate('/platform', { replace: true })
      } else if (identity.type === 'member') {
        // Super Admin, Team Admin, or Member
        navigate('/dashboard', { replace: true })
      }
    }
  }, [identity, loading, navigate])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-sm text-gray-600">Completing sign in...</p>
      </div>
    </div>
  )
}
