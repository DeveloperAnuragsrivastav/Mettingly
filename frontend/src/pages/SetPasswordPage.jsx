import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AlertCircle, Lock } from 'lucide-react'
import AuthBrandPanel from '../components/auth/AuthBrandPanel'
import toast from 'react-hot-toast'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      return setError('Password must be at least 6 characters.')
    }
    if (password !== confirmPassword) {
      return setError('Passwords do not match.')
    }

    setIsLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) throw updateError

      // Sign out so they have a clean session when they log in manually
      await supabase.auth.signOut()
      
      toast.success('Password set successfully. Please log in.')
      navigate('/login')
    } catch (err) {
      setError(err.message || 'An error occurred while setting password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-white font-sans text-gray-900">

      <AuthBrandPanel />

      {/* Right Panel - Set Password Form */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-4 py-12 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10 justify-center">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xl leading-none">M</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">Meeting SaaS</span>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-indigo-50">
                <Lock className="w-5 h-5 text-indigo-600" />
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
                Set Your Password
              </h2>
            </div>
            <p className="text-sm text-gray-500">
              Welcome! Please create a secure password for your account.
            </p>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 p-4 border border-red-100">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium leading-tight">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                required
                className="block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 sm:text-sm transition-colors shadow-sm"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                className="block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 sm:text-sm transition-colors shadow-sm"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? 'Processing...' : 'Set Password'}
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  )
}
