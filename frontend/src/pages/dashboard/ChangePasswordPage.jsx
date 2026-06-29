import React, { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { AlertCircle, CheckCircle2, Lock } from 'lucide-react'

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

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

      setSuccess('Password updated successfully.')
      setPassword('')
      setConfirmPassword('')
      
      // Note: A robust implementation might require re-authentication here
      // before allowing sensitive changes, but for this MVP, being logged in is sufficient.
    } catch (err) {
      setError(err.message || 'An error occurred while changing password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-8 lg:p-10 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-indigo-50">
            <Lock className="w-5 h-5 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Change Password</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500 ml-12">Update your account password.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 p-4 border border-red-100">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium leading-tight">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-6 flex items-start gap-3 rounded-lg bg-emerald-50 p-4 border border-emerald-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-700 font-medium leading-tight">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-5 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                New Password
              </label>
              <input
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                className="block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 sm:text-sm transition-colors shadow-sm"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isLoading ? 'Saving...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
