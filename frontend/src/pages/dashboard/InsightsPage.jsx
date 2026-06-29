import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { insightsApi } from '../../api/insights'
import { membersApi } from '../../api/members'
import BookingsTable from '../../components/bookings/BookingsTable'

export default function InsightsPage() {
  const { identity } = useAuth()
  const isSuperAdmin = identity?.data?.role === 'super_admin'

  // Default to current month
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(firstDay)
  const [endDate, setEndDate] = useState(lastDay)
  
  const [utilization, setUtilization] = useState(null)
  const [bookings, setBookings] = useState(null)
  const [membersMap, setMembersMap] = useState({})
  const [bookingStatusFilter, setBookingStatusFilter] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Fetch members once to build a lookup map for names
    membersApi.listMembers().then(members => {
      const map = {}
      members.forEach(m => {
        map[m.id] = m
      })
      setMembersMap(map)
    }).catch(err => console.error("Failed to fetch members for insights lookup", err))
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [utilRes, bookingsRes] = await Promise.all([
          insightsApi.getUtilization(startDate, endDate),
          insightsApi.getBookings(startDate, endDate, bookingStatusFilter || null)
        ])
        setUtilization(utilRes)
        setBookings(bookingsRes)
      } catch (err) {
        console.error("Failed to fetch insights", err)
        setError("Failed to load insights data.")
      } finally {
        setIsLoading(false)
      }
    }

    if (startDate && endDate) {
      fetchData()
    }
  }, [startDate, endDate, bookingStatusFilter])

  // Compute Member Breakdown
  const memberBreakdown = useMemo(() => {
    if (!utilization?.daily_records) return []
    
    const acc = {}
    utilization.daily_records.forEach(record => {
      const mid = record.member_id
      if (!acc[mid]) {
        acc[mid] = { 
          member_id: mid,
          bookings: 0,
          cancelled: 0,
          rescheduled: 0,
          minutes: 0,
          team_id: record.team_id
        }
      }
      acc[mid].bookings += (record.bookings_count || 0)
      acc[mid].cancelled += (record.cancelled_count || 0)
      acc[mid].rescheduled += (record.rescheduled_count || 0)
      acc[mid].minutes += (record.total_booked_minutes || 0)
    })
    
    return Object.values(acc).map(stats => {
      const cancelRate = stats.bookings > 0 ? (stats.cancelled / stats.bookings) : 0
      const memberInfo = membersMap[stats.member_id]
      return {
        ...stats,
        cancelRate,
        name: memberInfo?.full_name || 'Unknown Member',
        teamName: memberInfo?.team_name || 'Unknown Team'
      }
    }).sort((a, b) => b.bookings - a.bookings)
  }, [utilization, membersMap])

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isSuperAdmin ? 'Organization Insights' : 'Team Insights'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Overview of booking volume and utilization.
          </p>
        </div>
        
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
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm font-medium text-gray-500 mb-1">Total Bookings</div>
          <div className="text-3xl font-bold text-gray-900">{utilization?.summary?.bookings_count || 0}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm font-medium text-gray-500 mb-1">Cancelled</div>
          <div className="text-3xl font-bold text-red-600">{utilization?.summary?.cancelled_count || 0}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm font-medium text-gray-500 mb-1">Rescheduled</div>
          <div className="text-3xl font-bold text-amber-600">{utilization?.summary?.rescheduled_count || 0}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm font-medium text-gray-500 mb-1">Cancel Rate</div>
          <div className="text-3xl font-bold text-gray-900">
            {utilization?.summary ? (utilization.summary.cancel_rate * 100).toFixed(1) : '0.0'}%
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="text-sm font-medium text-gray-500 mb-1">Booked Hours</div>
          <div className="text-3xl font-bold text-gray-900">
            {utilization?.summary ? (utilization.summary.total_booked_minutes / 60).toFixed(1) : '0.0'}h
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Member Breakdown */}
        <div className="lg:col-span-1 bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-medium text-gray-900">Member Breakdown</h2>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[600px] p-0">
            {isLoading && !utilization ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : memberBreakdown.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No data for this period.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {memberBreakdown.map(m => (
                  <li key={m.member_id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{m.name}</div>
                        {isSuperAdmin && (
                          <div className="text-xs text-gray-500">{m.teamName}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-indigo-600">{m.bookings}</div>
                        <div className="text-xs text-gray-500">bookings</div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <div>{(m.minutes / 60).toFixed(1)} hrs</div>
                      <div className={m.cancelRate > 0.2 ? 'text-red-500 font-medium' : ''}>
                        {(m.cancelRate * 100).toFixed(1)}% cancelled
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Recent Bookings */}
        <div className="lg:col-span-2 bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">Recent Bookings</h2>
            <select
              value={bookingStatusFilter}
              onChange={e => setBookingStatusFilter(e.target.value)}
              className="text-sm border-gray-300 rounded-md py-1.5 pl-3 pr-8 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rescheduled">Rescheduled</option>
            </select>
          </div>
          <div className="flex-1 overflow-x-auto">
            <BookingsTable
              bookings={bookings?.items || []}
              isLoading={isLoading && !bookings}
              showHost={true}
              showMeetLink={false}
              membersMap={membersMap}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
