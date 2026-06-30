import React, { useState } from 'react'
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

/** Tooltip that appears above the hovered element */
function Tooltip({ text }) {
  return (
    <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-20 w-max max-w-xs bg-gray-900 text-white text-xs rounded shadow-lg p-2 whitespace-normal break-words pointer-events-none">
      {text}
      <div className="absolute top-full left-4 -mt-px border-4 border-transparent border-t-gray-900" />
    </div>
  )
}

/** Purple AI tooltip */
function AiTooltip({ text }) {
  return (
    <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block z-20 w-max max-w-xs bg-purple-900 text-purple-50 text-xs rounded shadow-lg p-2 whitespace-normal break-words border border-purple-700 pointer-events-none">
      <span className="italic">{text}</span>
      <div className="absolute top-full left-4 -mt-px border-4 border-transparent border-t-purple-700" />
    </div>
  )
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
  // colCount: Date + Caller + (Host?) + Duration + Status + AI Insight + (Meet?)
  const colCount = 5 + (showHost ? 1 : 0) + (showMeetLink ? 1 : 0)

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
            <th className="px-6 py-3 text-left text-xs font-medium text-purple-600 uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                  <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
                </svg>
                AI Insight
              </div>
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
                  {/* Date */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDateTime(b.start_time_utc)}
                  </td>

                  {/* Caller */}
                  <td className="px-6 py-4 text-sm text-gray-900 min-w-[240px]">
                    <div className="font-medium">{b.caller_name}</div>
                    <div className="text-gray-500 text-xs mt-0.5 mb-1">{b.caller_email}</div>

                    {b.custom_form_responses?.reason && (
                      <div className="group relative mt-1 max-w-xs">
                        <div className="text-gray-600 text-xs truncate">
                          <span className="font-medium">Reason:</span> {b.custom_form_responses.reason}
                        </div>
                        <Tooltip text={`Reason: ${b.custom_form_responses.reason}`} />
                      </div>
                    )}

                    {b.custom_form_responses?.summary && (
                      <div className="group relative mt-0.5 max-w-xs">
                        <div className="text-gray-600 text-xs truncate">
                          <span className="font-medium">Summary:</span> {b.custom_form_responses.summary}
                        </div>
                        <Tooltip text={`Summary: ${b.custom_form_responses.summary}`} />
                      </div>
                    )}

                    {/* AI TLDR inline badge */}
                    {b.ai_tldr && (
                      <div className="group relative mt-2 max-w-xs">
                        <div className="flex items-center gap-1 pl-2.5 border-l-2 border-purple-300 bg-gradient-to-r from-purple-50 to-transparent py-1 pr-2 rounded-r text-purple-800 text-xs truncate">
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-purple-500">
                            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                          </svg>
                          <span className="italic truncate">{b.ai_tldr}</span>
                        </div>
                        <AiTooltip text={b.ai_tldr} />
                      </div>
                    )}

                    {/* Prep Notes accordion — member view only, upcoming confirmed */}
                    {!showHost && upcoming && b.status === 'confirmed' && (
                      <details className="mt-2.5 group/details bg-purple-50 rounded-lg border border-purple-100 overflow-hidden max-w-xs open:pb-2.5 open:shadow-sm">
                        <summary className="cursor-pointer px-2.5 py-1.5 text-xs font-semibold text-purple-700 flex items-center justify-between hover:bg-purple-100 transition-colors list-none [&::-webkit-details-marker]:hidden select-none">
                          <span className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500">
                              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                            </svg>
                            AI Prep Notes
                          </span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400 group-open/details:rotate-180 transition-transform">
                            <path d="m6 9 6 6 6-6"/>
                          </svg>
                        </summary>
                        <div className="px-2.5 pt-1.5 border-t border-purple-100">
                          {b.ai_meeting_prep_status === 'generated' ? (
                            <div className="space-y-1.5">
                              {(b.ai_meeting_prep_content?.is_repeat_caller === true || b.ai_meeting_prep_content?.is_repeat_caller === 'true') && (
                                <span className="inline-block px-1.5 py-0.5 bg-purple-200 text-purple-800 text-[10px] font-bold rounded uppercase tracking-wider">🔄 Repeat Caller</span>
                              )}
                              <p className="text-xs text-gray-700 leading-relaxed">{b.ai_meeting_prep_content?.caller_context}</p>
                              {b.ai_meeting_prep_content?.talking_points?.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-semibold text-purple-800 mb-0.5">Talking Points:</p>
                                  <ul className="list-disc pl-4 text-xs text-gray-600 space-y-0.5">
                                    {b.ai_meeting_prep_content.talking_points.map((pt, i) => (
                                      <li key={i}>{pt}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-purple-400 italic">Available closer to meeting time.</p>
                          )}
                        </div>
                      </details>
                    )}
                  </td>

                  {/* Host */}
                  {showHost && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {membersMap[b.assigned_member_id]?.full_name || 'Unknown'}
                    </td>
                  )}

                  {/* Duration */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {duration ? `${duration} min` : '—'}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[b.status] || 'bg-gray-100 text-gray-800'}`}>
                      {b.status}
                    </span>
                  </td>

                  {/* AI Insight */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {b.ai_summary_status === 'pending' ? (
                      <span className="text-purple-400 text-xs italic flex items-center gap-1 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        Generating…
                      </span>
                    ) : b.ai_summary_status === 'generated' ? (
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium w-fit capitalize shadow-sm border ${
                          b.ai_priority === 'high'   ? 'bg-red-50 text-red-700 border-red-200' :
                          b.ai_priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          {b.ai_priority} Priority
                        </span>
                        {b.ai_category && (
                          <span className="text-[10px] font-semibold tracking-wide uppercase text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 w-fit">
                            {b.ai_category}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>

                  {/* Meet link */}
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
