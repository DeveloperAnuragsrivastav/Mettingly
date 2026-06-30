import React, { useState, useEffect } from 'react'
import { Video, ExternalLink, Mail, Copy, CheckSquare, Square, FileText } from 'lucide-react'
import { insightsApi } from '../../api/insights'

const STATUS_STYLES = {
  confirmed: 'bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]',
  cancelled: 'bg-error-container text-on-error-container border border-error/20',
  rescheduled: 'bg-[#fffbeb] text-[#854d0e] border border-[#fef08a]',
  external: 'bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0]',
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

function FollowupCell({ booking, isAdminView }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState(booking.ai_followup_content || null)
  
  useEffect(() => {
    if (booking.ai_followup_content) {
      setDraft(booking.ai_followup_content)
    }
  }, [booking.ai_followup_content])

  const isPast = !isUpcoming(booking.start_time_utc)
  const isConfirmed = booking.status === 'confirmed' || booking.status === 'external'

  if (isAdminView) {
    if (!isPast || !isConfirmed) return <span className="text-gray-300 text-sm">—</span>
    if (booking.ai_followup_status === 'generated') {
      return <span className="text-xs text-emerald-600 font-medium whitespace-nowrap">✓ Sent-side generated</span>
    }
    return <span className="text-xs text-gray-500 whitespace-nowrap">— Not yet</span>
  }

  if (!isPast || !isConfirmed) {
    return <span className="text-gray-300 text-sm">—</span>
  }

  const handleGenerate = async (regenerate = false) => {
    if (!notes.trim()) return
    setIsGenerating(true)
    try {
      const res = await insightsApi.generateFollowup(booking.id, notes, regenerate)
      setDraft(res)
      booking.ai_followup_status = 'generated'
    } catch (err) {
      alert('Failed to generate follow-up')
    } finally {
      setIsGenerating(false)
    }
  }

  const copyToClipboard = () => {
    if (!draft) return
    const text = `Subject: ${draft.subject}\n\n${draft.body}`
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  return (
    <div>
      {booking.ai_followup_status === 'generated' ? (
        <button onClick={() => setIsModalOpen(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap border border-indigo-200 px-2 py-1 rounded bg-indigo-50">
          View / Edit Draft
        </button>
      ) : (
        <button onClick={() => setIsModalOpen(true)} className="text-xs px-2 py-1 bg-white text-gray-700 border border-gray-300 rounded shadow-sm hover:bg-gray-50 whitespace-nowrap">
          Generate Follow-up
        </button>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Follow-up Draft</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-medium">&times;</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Post-Meeting Notes <span className="text-red-500">*</span></label>
                <textarea 
                  className="w-full border border-gray-300 rounded-lg shadow-sm sm:text-sm focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="What was discussed, any next steps..."
                />
              </div>
              
              <div>
                <button 
                  onClick={() => handleGenerate(!!draft)} 
                  disabled={!notes.trim() || isGenerating}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGenerating ? 'Generating...' : (draft ? 'Regenerate Draft' : 'Generate Draft')}
                </button>
              </div>

              {draft && (
                <div className="pt-5 border-t border-gray-200 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                    <input 
                      type="text" 
                      className="w-full border border-gray-300 rounded-lg shadow-sm sm:text-sm focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
                      value={draft.subject}
                      onChange={e => setDraft({...draft, subject: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Body</label>
                    <textarea 
                      className="w-full border border-gray-300 rounded-lg shadow-sm sm:text-sm focus:ring-indigo-500 focus:border-indigo-500 p-2.5 font-mono text-sm leading-relaxed"
                      rows={8}
                      value={draft.body}
                      onChange={e => setDraft({...draft, body: e.target.value})}
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={copyToClipboard}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 text-sm font-medium rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                    <a 
                      href={`mailto:${booking.caller_email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-transparent bg-indigo-50 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      Email Client
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MeetingNotesCell({ booking, isAdminView }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [content, setContent] = useState(booking.ai_meeting_notes_content || null)
  const [actionItems, setActionItems] = useState(booking.ai_action_items || [])
  
  useEffect(() => {
    if (booking.ai_meeting_notes_content) setContent(booking.ai_meeting_notes_content)
    if (booking.ai_action_items) setActionItems(booking.ai_action_items)
  }, [booking.ai_meeting_notes_content, booking.ai_action_items])

  const isPast = (new Date(booking.start_time_utc) < new Date())
  const isConfirmed = booking.status === 'confirmed' || booking.status === 'external'

  if (!isPast || !isConfirmed) {
    return <span className="text-gray-300 text-sm">—</span>
  }

  const hasNotes = booking.ai_meeting_notes_status === 'generated'

  if (isAdminView && !hasNotes) {
    return <span className="text-xs text-gray-500 whitespace-nowrap">— Not generated</span>
  }

  const handleGenerate = async (regenerate = false) => {
    if (!notes.trim()) return
    setIsGenerating(true)
    try {
      const res = await insightsApi.generateNotes(booking.id, notes, regenerate)
      setContent({ key_points: res.key_points, decisions: res.decisions })
      setActionItems(res.action_items || [])
      booking.ai_meeting_notes_status = 'generated'
    } catch (err) {
      alert('Failed to generate notes')
    } finally {
      setIsGenerating(false)
    }
  }

  const toggleActionItem = async (item) => {
    const newStatus = !item.is_done
    setActionItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: newStatus } : i))
    try {
      await insightsApi.updateActionItem(item.id, newStatus)
    } catch (err) {
      alert('Failed to update action item')
      setActionItems(prev => prev.map(i => i.id === item.id ? { ...i, is_done: !newStatus } : i))
    }
  }

  return (
    <div>
      {hasNotes ? (
        <button onClick={() => setIsModalOpen(true)} className="text-xs font-medium text-emerald-700 hover:text-emerald-900 whitespace-nowrap border border-emerald-200 px-2 py-1 rounded bg-emerald-50 flex items-center gap-1">
          <FileText className="w-3.5 h-3.5" />
          View Notes
        </button>
      ) : (
        <button onClick={() => setIsModalOpen(true)} className="text-xs px-2 py-1 bg-white text-gray-700 border border-gray-300 rounded shadow-sm hover:bg-gray-50 whitespace-nowrap">
          Generate Notes
        </button>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Internal Meeting Notes</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-medium">&times;</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {!isAdminView && (
                <div className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-medium text-gray-700">Your Rough Notes <span className="text-red-500">*</span></label>
                  <textarea 
                    className="w-full border border-gray-300 rounded-lg shadow-sm sm:text-sm focus:ring-emerald-500 focus:border-emerald-500 p-2.5"
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Jot down what happened..."
                  />
                  <button 
                    onClick={() => handleGenerate(hasNotes)} 
                    disabled={!notes.trim() || isGenerating}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {isGenerating ? 'Generating...' : (hasNotes ? 'Regenerate Notes' : 'Generate Notes')}
                  </button>
                </div>
              )}

              {content && (
                <div className="space-y-6">
                  {content.key_points && content.key_points.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">Key Points</h4>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                        {content.key_points.map((kp, i) => <li key={i}>{kp}</li>)}
                      </ul>
                    </div>
                  )}
                  
                  {content.decisions && content.decisions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">Decisions</h4>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                        {content.decisions.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    </div>
                  )}

                  {actionItems && actionItems.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">Action Items</h4>
                      <div className="space-y-2">
                        {actionItems.map((item) => (
                          <div 
                            key={item.id} 
                            onClick={() => toggleActionItem(item)}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${item.is_done ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300 hover:border-emerald-400 shadow-sm'}`}
                          >
                            <button className={`mt-0.5 flex-shrink-0 transition-colors ${item.is_done ? 'text-emerald-500' : 'text-gray-400'}`}>
                              {item.is_done ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                            </button>
                            <span className={`text-sm select-none ${item.is_done ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                              {item.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
  // colCount: Date + Caller + (Host?) + Duration + Status + AI Insight + Follow-up + Notes + (Meet?)
  const colCount = 7 + (showHost ? 1 : 0) + (showMeetLink ? 1 : 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[900px] divide-y divide-outline-variant">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-bright">
            <th className="py-3 px-lg font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">
              Date &amp; Time
            </th>
            <th className="py-3 px-lg font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">
              Caller
            </th>
            {showHost && (
              <th className="py-3 px-lg font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">
                Host
              </th>
            )}
            <th className="py-3 px-lg font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">
              Duration
            </th>
            <th className="py-3 px-lg font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">
              Status
            </th>
            <th className="py-3 px-lg font-label-md text-label-md text-primary font-medium tracking-wide uppercase text-[11px]">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                  <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
                </svg>
                AI Insight
              </div>
            </th>
            <th className="py-3 px-lg font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">
              Follow-up
            </th>
            <th className="py-3 px-lg font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">
              Internal Notes
            </th>
            {showMeetLink && (
              <th className="py-3 px-lg font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px] text-right">
                Meet
              </th>
            )}
          </tr>
        </thead>
        <tbody className={`divide-y divide-outline-variant ${isLoading && bookings.length > 0 ? 'opacity-50 pointer-events-none transition-opacity duration-200' : ''}`}>
          {isLoading && bookings.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-8 px-lg text-center text-on-surface-variant">
                <div className="flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-primary"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Loading bookings…
                </div>
              </td>
            </tr>
          ) : bookings.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-8 px-lg text-center text-on-surface-variant font-body-md text-body-md">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            bookings.map((b) => {
              const duration = computeDuration(b.start_time_utc, b.end_time_utc)
              const upcoming = isUpcoming(b.start_time_utc)
              const canJoin = upcoming && b.status === 'confirmed' && b.google_meet_link

              return (
                <tr key={b.id} className="hover:bg-surface-container-low/50 transition-colors">
                  {/* Date */}
                  <td className="py-md px-lg align-top">
                    <div className="font-body-md text-body-md text-on-surface font-medium whitespace-nowrap">
                      {formatDateTime(b.start_time_utc)}
                    </div>
                  </td>

                  {/* Caller */}
                  <td className="py-md px-lg align-top">
                    <div className="font-label-md text-label-md text-on-surface font-semibold">{b.caller_name}</div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant mb-2">{b.caller_email}</div>

                    {b.custom_form_responses?.reason && (
                      <div className="font-body-sm text-body-sm text-on-surface">
                        <span className="font-medium">Reason:</span> {b.custom_form_responses.reason}
                      </div>
                    )}

                    {b.custom_form_responses?.summary && (
                      <div className="font-body-sm text-body-sm text-on-surface">
                        <span className="font-medium">Summary:</span> {b.custom_form_responses.summary}
                      </div>
                    )}

                    {/* AI TLDR inline badge */}
                    {b.ai_tldr && (
                      <div className="mt-2 text-primary font-body-sm text-body-sm italic flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary flex-shrink-0">
                          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                        </svg>
                        {b.ai_tldr}
                      </div>
                    )}

                    {/* Prep Notes accordion — member view only, upcoming confirmed */}
                    {!showHost && upcoming && b.status === 'confirmed' && (
                      <details className="mt-3 group bg-primary-container/10 rounded-lg border border-primary/10 overflow-hidden max-w-xs open:pb-2.5 open:shadow-sm">
                        <summary className="cursor-pointer px-2.5 py-1.5 text-xs font-semibold text-primary flex items-center justify-between hover:bg-primary-container/20 transition-colors list-none [&::-webkit-details-marker]:hidden select-none">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">menu_book</span>
                            AI Prep Notes
                          </span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary/70 group-open:rotate-180 transition-transform">
                            <path d="m6 9 6 6 6-6"/>
                          </svg>
                        </summary>
                        <div className="px-2.5 pt-1.5 border-t border-primary/10">
                          {b.ai_meeting_prep_status === 'generated' ? (
                            <div className="space-y-1.5">
                              {(b.ai_meeting_prep_content?.is_repeat_caller === true || b.ai_meeting_prep_content?.is_repeat_caller === 'true') && (
                                <span className="inline-block px-1.5 py-0.5 bg-primary-fixed text-on-primary-fixed-variant text-[10px] font-bold rounded uppercase tracking-wider">🔄 Repeat Caller</span>
                              )}
                              <p className="text-xs text-on-surface leading-relaxed">{b.ai_meeting_prep_content?.caller_context}</p>
                              {b.ai_meeting_prep_content?.talking_points?.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-semibold text-primary mb-0.5">Talking Points:</p>
                                  <ul className="list-disc pl-4 text-xs text-on-surface-variant space-y-0.5">
                                    {b.ai_meeting_prep_content.talking_points.map((pt, i) => (
                                      <li key={i}>{pt}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-primary/70 italic">Available closer to meeting time.</p>
                          )}
                        </div>
                      </details>
                    )}
                  </td>

                  {/* Host */}
                  {showHost && (
                    <td className="py-md px-lg align-top font-body-md text-body-md text-on-surface">
                      {membersMap[b.assigned_member_id]?.full_name || 'Unknown'}
                    </td>
                  )}

                  {/* Duration */}
                  <td className="py-md px-lg align-top font-body-md text-body-md text-on-surface-variant whitespace-nowrap">
                    {duration ? `${duration} min` : '—'}
                  </td>

                  {/* Status */}
                  <td className="py-md px-lg align-top">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium capitalize ${STATUS_STYLES[b.status] || 'bg-gray-100 text-gray-800'}`}>
                      {b.status}
                    </span>
                  </td>

                  {/* AI Insight */}
                  <td className="py-md px-lg align-top">
                    {b.ai_summary_status === 'pending' ? (
                      <span className="text-primary text-xs italic flex items-center gap-1 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        Generating…
                      </span>
                    ) : b.ai_summary_status === 'generated' ? (
                      <div className="flex flex-col gap-1.5 items-start">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium w-fit capitalize border ${
                          b.ai_priority === 'high'   ? 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]' :
                          b.ai_priority === 'medium' ? 'bg-[#fefce8] text-[#854d0e] border-[#fef08a]' :
                          'bg-surface-container-high text-on-surface-variant border-outline-variant'
                        }`}>
                          {b.ai_priority} Priority
                        </span>
                        {b.ai_category && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-primary-container text-on-primary text-xs font-semibold tracking-wider uppercase">
                            {b.ai_category}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-on-surface-variant/30">—</span>
                    )}
                  </td>

                  {/* Follow-up */}
                  <td className="py-md px-lg align-top">
                    <FollowupCell booking={b} isAdminView={showHost} />
                  </td>

                  {/* Meeting Notes */}
                  <td className="py-md px-lg align-top">
                    <MeetingNotesCell booking={b} isAdminView={showHost} />
                  </td>

                  {/* Meet link */}
                  {showMeetLink && (
                    <td className="py-md px-lg align-top text-right">
                      {canJoin ? (
                        <a
                          href={b.google_meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 bg-surface-container border border-primary/30 text-primary px-4 py-2 rounded-lg font-label-md text-label-md hover:bg-primary-container transition-colors"
                        >
                          <Video className="w-[18px] h-[18px]" />
                          Join
                          <ExternalLink className="w-[16px] h-[16px]" />
                        </a>
                      ) : (
                        <span className="text-on-surface-variant/30">—</span>
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
