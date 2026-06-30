import React, { useState, useEffect } from 'react'
import { insightsApi } from '../../api/insights'
import BookingsTable from '../../components/bookings/BookingsTable'
import { CalendarDays, Filter, Copy, Check, Link2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function MyBookingsPage() {
  const { identity } = useAuth()
  const teamSlug = identity?.data?.team_slug

  const [copiedLink, setCopiedLink] = useState(false)
  const FRONTEND_URL = window.location.origin
  
  const handleCopyLink = () => {
    if (teamSlug) {
      navigator.clipboard.writeText(`${FRONTEND_URL}/book/${teamSlug}`)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }
  // Default range: 30 days in the past → 60 days in the future (bias toward upcoming)
  const today = new Date()
  const pastDate = new Date(today)
  pastDate.setDate(pastDate.getDate() - 30)
  const futureDate = new Date(today)
  futureDate.setDate(futureDate.getDate() + 60)

  const [startDate, setStartDate] = useState(pastDate.toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(futureDate.toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState('')
  const [bookings, setBookings] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchBookings = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await insightsApi.getBookings(
          startDate,
          endDate,
          statusFilter || null
        )
        setBookings(res.items || [])
      } catch (err) {
        console.error('Failed to fetch bookings', err)
        setError('Failed to load your bookings.')
      } finally {
        setIsLoading(false)
      }
    }

    if (startDate && endDate) {
      fetchBookings()
    }
  }, [startDate, endDate, statusFilter])

  // Split into upcoming vs past for display ordering
  const now = new Date()
  const upcoming = bookings
    .filter(b => new Date(b.start_time_utc) >= now && (b.status === 'confirmed' || b.status === 'external'))
    .sort((a, b) => new Date(a.start_time_utc) - new Date(b.start_time_utc))
  const rest = bookings
    .filter(b => !(new Date(b.start_time_utc) >= now && (b.status === 'confirmed' || b.status === 'external')))
    .sort((a, b) => new Date(b.start_time_utc) - new Date(a.start_time_utc))

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-500" />
            My Bookings
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Your assigned meetings and their statuses.
          </p>
          {teamSlug && (
            <div className="mt-3 flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 rounded-lg px-3 py-2 w-fit">
              <Link2 className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-medium text-indigo-900">Your Team Link:</span>
              <span className="text-sm text-indigo-600 font-mono select-all">/book/{teamSlug}</span>
              <button
                onClick={handleCopyLink}
                className="ml-2 p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors"
                title="Copy booking link"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Date Range */}
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border-none text-sm focus:ring-0 text-gray-700 bg-transparent"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border-none text-sm focus:ring-0 text-gray-700 bg-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg shadow-sm border border-gray-200">
            <Filter className="w-4 h-4 text-gray-400 ml-1" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border-none focus:ring-0 text-gray-700 bg-transparent pr-6"
            >
              <option value="">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="external">External (Google Calendar)</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Upcoming Meetings */}
      {upcoming.length > 0 && (
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-indigo-50/50">
            <h2 className="text-lg font-semibold text-indigo-900">
              Upcoming Meetings
              <span className="ml-2 text-sm font-normal text-indigo-600">
                ({upcoming.length})
              </span>
            </h2>
          </div>
          <BookingsTable
            bookings={upcoming}
            isLoading={false}
            showHost={false}
            showMeetLink={true}
          />
        </div>
      )}

      {/* All / Past Bookings */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-medium text-gray-900">
            {upcoming.length > 0 ? 'Past & Other Bookings' : 'Bookings'}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({rest.length})
            </span>
          </h2>
        </div>
        <BookingsTable
          bookings={rest}
          isLoading={isLoading}
          showHost={false}
          showMeetLink={true}
          emptyMessage="No bookings found for this period."
        />
      </div>
    </div>
  )
}
