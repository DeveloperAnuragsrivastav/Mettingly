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
    <div className="space-y-xl pb-20 fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="text-primary w-7 h-7" />
            <h2 className="font-headline-lg text-headline-lg text-on-surface">My Bookings</h2>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">Your assigned meetings and their statuses.</p>
          {teamSlug && (
            <div className="mt-4 flex items-center gap-2 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 w-fit">
              <Link2 className="text-primary w-4 h-4" />
              <span className="font-label-md text-label-md text-on-surface-variant">Your Team Link:</span>
              <button
                onClick={handleCopyLink}
                className="font-label-md text-label-md text-primary hover:underline flex items-center gap-1.5 focus:outline-none"
              >
                /book/{teamSlug}
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-on-surface-variant" />}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Date Range */}
          <div className="flex items-center border border-outline-variant rounded-lg bg-surface-container-lowest px-3 py-2 w-full md:w-auto">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border-none bg-transparent p-0 font-body-md text-body-md text-on-surface w-28 focus:ring-0 outline-none"
            />
            <span className="font-body-md text-body-md text-on-surface-variant mx-2">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border-none bg-transparent p-0 font-body-md text-body-md text-on-surface w-28 focus:ring-0 outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="relative w-full md:w-auto min-w-[180px]">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full appearance-none border border-outline-variant rounded-lg bg-surface-container-lowest pl-9 pr-8 py-2 font-body-md text-body-md text-on-surface focus:ring-primary focus:border-primary outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="external">External (Google Calendar)</option>
            </select>
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-error-container text-on-error-container border border-error/20 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Upcoming Meetings */}
      {upcoming.length > 0 && (
        <section className="mb-xl">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div className="bg-surface-container-low px-lg py-4 border-b border-outline-variant">
              <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
                Upcoming Meetings <span className="font-label-md text-label-md bg-primary-fixed text-on-primary-fixed-variant px-2 py-0.5 rounded-full">({upcoming.length})</span>
              </h3>
            </div>
            <BookingsTable
              bookings={upcoming}
              isLoading={false}
              showHost={false}
              showMeetLink={true}
            />
          </div>
        </section>
      )}

      {/* All / Past Bookings */}
      <section>
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="bg-surface-container-low px-lg py-4 border-b border-outline-variant">
            <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
              {upcoming.length > 0 ? 'Past & Other Bookings' : 'Bookings'} <span className="font-label-md text-label-md bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded-full">({rest.length})</span>
            </h3>
          </div>
          <BookingsTable
            bookings={rest}
            isLoading={isLoading}
            showHost={false}
            showMeetLink={true}
            emptyMessage="No bookings found for this period."
          />
        </div>
      </section>
    </div>
  )
}
