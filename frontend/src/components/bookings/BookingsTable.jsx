import React from 'react'
import { Video, ExternalLink } from 'lucide-react'

const STATUS_STYLES = {
  confirmed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  rescheduled: 'bg-amber-100 text-amber-800',
  external: 'bg-slate-100 text-slate-700',
}

function formatDateTime(utcString) {
  if (!utcString) return '—'
  return new Date(utcString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function computeDuration(startUtc, endUtc) {
  if (!startUtc || !endUtc) return null
  const diffMs = new Date(endUtc) - new Date(startUtc)
  return Math.round(diffMs / 60000)
}

function isUpcoming(startUtc) {
  if (!startUtc) return false
  return new Date(startUtc) > new Date()
}

/**
 * Shared bookings table used by both InsightsPage (admin view) and MyBookingsPage (member view).
 *
 * Props:
 *   bookings       — array of booking objects
 *   isLoading      — boolean
 *   showHost       — if true, renders a "Host" column (admin view); member view hides it
 *   showMeetLink   — if true, renders a "Meet" column with Join links for upcoming confirmed bookings
 *   membersMap     — { memberId: { full_name, ... } } lookup for host names (only needed if showHost)
 *   emptyMessage   — optional custom empty-state string
 */
export default function BookingsTable({
  bookings = [],
  isLoading = false,
  showHost = false,
  showMeetLink = false,
  membersMap = {},
  emptyMessage = 'No bookings found.',
}) {
  const colCount = 3 + (showHost ? 1 : 0) + (showMeetLink ? 1 : 0)

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date &amp; Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Caller
            </th>
            {showHost && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Host
              </th>
            )}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Duration
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            {showMeetLink && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Meet
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {isLoading ? (
            <tr>
              <td colSpan={colCount} className="px-6 py-8 text-center text-gray-500">
                Loading bookings…
              </td>
            </tr>
          ) : bookings.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-6 py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            bookings.map((b) => {
              const duration = computeDuration(b.start_time_utc, b.end_time_utc)
              const upcoming = isUpcoming(b.start_time_utc)
              const canJoin = upcoming && b.status === 'confirmed' && b.google_meet_link

              return (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDateTime(b.start_time_utc)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 min-w-[250px]">
                    <div className="font-medium">{b.caller_name}</div>
                    <div className="text-gray-500 text-xs mt-0.5 mb-1.5">{b.caller_email}</div>
                    {b.custom_form_responses?.reason && (
                      <div className="text-gray-600 text-xs truncate max-w-sm mt-1" title={b.custom_form_responses.reason}>
                        <span className="font-medium">Reason:</span> {b.custom_form_responses.reason}
                      </div>
                    )}
                    {b.custom_form_responses?.summary && (
                      <div className="text-gray-600 text-xs truncate max-w-sm mt-0.5" title={b.custom_form_responses.summary}>
                        <span className="font-medium">Summary:</span> {b.custom_form_responses.summary}
                      </div>
                    )}
                  </td>
                  {showHost && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {membersMap[b.assigned_member_id]?.full_name || 'Unknown'}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {duration ? `${duration} min` : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        STATUS_STYLES[b.status] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  {showMeetLink && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {canJoin ? (
                        <a
                          href={b.google_meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 font-medium text-xs hover:bg-indigo-100 transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Join
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
