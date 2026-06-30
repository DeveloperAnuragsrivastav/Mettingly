import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { calendarApi } from '../../api/calendar'

export default function CalendarConnectPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(searchParams.get('error') || null)
  const [showSuccess, setShowSuccess] = useState(searchParams.get('connected') === 'true')
  
  useEffect(() => {
    // Clear URL params if they exist so they don't persist on refresh
    if (searchParams.has('connected') || searchParams.has('error')) {
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('connected')
      newParams.delete('error')
      setSearchParams(newParams, { replace: true })
    }

    const fetchStatus = async () => {
      try {
        const data = await calendarApi.getStatus()
        setStatus(data)
      } catch (err) {
        // If 404 or something else, we might just not be connected
        setError('Failed to load calendar status.')
      } finally {
        setIsLoading(false)
      }
    }
    fetchStatus()
  }, [])
  
  const handleConnect = async () => {
    try {
      setIsLoading(true)
      const data = await calendarApi.getConnectUrl(window.location.href)
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError('Failed to start connection flow.')
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isConnected = status && status.is_connected

  return (
    <div className="space-y-xl pb-20 fade-in">
      <div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">Calendar Connection</h2>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
          Connect your Google Calendar to synchronize your availability and bookings.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-error-container text-on-error-container border border-error/20 p-4 text-sm font-medium">
          {error}
        </div>
      )}
      
      {showSuccess && (
        <div className="rounded-lg bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0] p-4 text-sm font-medium">
          Calendar connected successfully!
        </div>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-surface-container-lowest rounded-full flex items-center justify-center border border-outline-variant shadow-sm shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </div>
              <div>
                <h3 className="font-label-md text-label-md text-on-surface font-semibold">Google Calendar</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {isConnected 
                    ? `Connected as ${status.connected_email}`
                    : 'Not connected'}
                </p>
              </div>
            </div>
            <div>
              {isConnected ? (
                <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0] text-sm font-medium">
                  <svg className="w-4 h-4 mr-1.5 text-[#166534]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Connected
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isLoading}
                  className="px-5 py-2 bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-sm transition-all border border-primary/20 disabled:opacity-50"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
