import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchMe, fetchPlatformMe } from '../api/auth'

const AuthContext = createContext({
  identity: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }) {
  const [identity, setIdentity] = useState(null)
  const [loading, setLoading] = useState(true)

  const resolveIdentity = async () => {
    setLoading(true)
    try {
      // 1. Try Platform Admin first
      try {
        const platformData = await fetchPlatformMe()
        setIdentity({ type: 'platform_admin', data: platformData })
        setLoading(false)
        return
      } catch (err) {
        if (err.response?.status !== 403 && err.response?.status !== 401) {
          console.error('Error fetching platform me:', err)
        }
      }

      // 2. Try Member
      try {
        const memberData = await fetchMe()
        setIdentity({ type: 'member', data: memberData })
        setLoading(false)
        return
      } catch (err) {
        if (err.response?.status !== 403 && err.response?.status !== 401) {
          console.error('Error fetching me:', err)
        }
      }

      // 3. Unauthorized (Valid Auth JWT but no DB record)
      setIdentity({ type: 'unauthorized', data: null })
    } catch (err) {
      console.error('Failed to resolve identity:', err)
      setIdentity(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        resolveIdentity()
      } else {
        setIdentity(null)
        setLoading(false)
      }
    })

    // Listen for auth changes (login, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          resolveIdentity()
        } else {
          setIdentity(null)
          setLoading(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setIdentity(null)
  }

  return (
    <AuthContext.Provider value={{ identity, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
