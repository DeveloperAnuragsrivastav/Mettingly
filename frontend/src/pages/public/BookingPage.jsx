import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { format, addDays, parseISO } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { bookingApi } from '../../api/booking'
import { Calendar, Clock, Globe, ArrowLeft, AlertCircle } from 'lucide-react'

export default function BookingPage() {
  const { teamSlug } = useParams()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // State for form
  const [duration, setDuration] = useState(30)
  const [slots, setSlots] = useState({})
  
  const [selectedSlot, setSelectedSlot] = useState(null) // holds the UTC datetime string
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    reason: '',
    summary: '',
  })
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Persist idempotency key across the session
  const idempotencyKey = useMemo(() => uuidv4(), [])
  
  // Detect local timezone
  const localTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (e) {
      return 'UTC'
    }
  }, [])

  const fetchSlots = async () => {
    try {
      setIsLoading(true)
      setError(null)
      setSubmitError(null)
      
      const today = new Date()
      const rangeStart = format(today, 'yyyy-MM-dd')
      const rangeEnd = format(addDays(today, 14), 'yyyy-MM-dd')
      
      const data = await bookingApi.getTeamSlots(teamSlug, duration, rangeStart, rangeEnd)
      
      // Group slots by local date
      const grouped = {}
      
      // data.slots is a dict of { "2026-06-25T10:00:00Z": ["uuid", "uuid"] }
      if (data.slots) {
        Object.keys(data.slots).forEach(utcTimeString => {
          // Convert to local time
          const dateUtc = parseISO(utcTimeString)
          const localDate = toZonedTime(dateUtc, localTimezone)
          const localDayKey = format(localDate, 'yyyy-MM-dd')
          
          if (!grouped[localDayKey]) {
            grouped[localDayKey] = []
          }
          
          grouped[localDayKey].push({
            utcStr: utcTimeString,
            localDate: localDate,
            formattedTime: format(localDate, 'h:mm a')
          })
        })
      }
      
      // Sort times within each day
      Object.keys(grouped).forEach(day => {
        grouped[day].sort((a, b) => a.localDate.getTime() - b.localDate.getTime())
      })
      
      setSlots(grouped)
    } catch (err) {
      if (err.response?.status === 404) {
        setError('This booking page does not exist.')
      } else if (err.response?.status === 410) {
        setError('This booking page is no longer active.')
      } else {
        setError('Failed to load availability. Please try again later.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSlots()
    setSelectedSlot(null)
  }, [teamSlug, duration])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedSlot) return

    try {
      setIsSubmitting(true)
      setSubmitError(null)

      const payload = {
        duration_minutes: duration,
        slot_start_utc: selectedSlot.utcStr,
        caller_name: formData.name,
        caller_email: formData.email,
        caller_timezone: localTimezone,
        custom_form_responses: {
          reason: formData.reason,
          summary: formData.summary
        },
        idempotency_key: idempotencyKey
      }

      const bookingResult = await bookingApi.createBooking(teamSlug, payload)
      
      // Navigate to confirmation page passing the token or booking details
      navigate(`/booking-confirmation`, {
        state: {
          booking: bookingResult,
          localTimezone,
          slotStart: selectedSlot.utcStr,
          duration
        }
      })
      
    } catch (err) {
      setIsSubmitting(false)
      
      if (err.response?.status === 409) {
        setSubmitError('This slot is no longer available. Please select another time.')
        setSelectedSlot(null)
        fetchSlots() // Refresh slots silently
      } else {
        setSubmitError(err.response?.data?.detail || 'An error occurred while booking. Please try again.')
      }
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-10 px-6 shadow-sm rounded-xl sm:px-10 text-center border border-gray-100">
            <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-gray-100 mb-5">
              <AlertCircle className="h-7 w-7 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{error}</h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              Please double check the URL or contact the organizer.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row min-h-[600px]">
        
        {/* Left Sidebar - Meeting Details */}
        <div className="w-full md:w-1/3 bg-gray-50/80 p-8 border-r border-gray-200 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm leading-none">M</span>
            </div>
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Meeting SaaS</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-6 capitalize">{teamSlug.replace(/-/g, ' ')} Meeting</h1>
          
          <div className="space-y-4 text-gray-600 mb-8">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-indigo-400" />
              <select 
                value={duration} 
                onChange={(e) => setDuration(Number(e.target.value))}
                className="bg-transparent font-medium border-b border-dashed border-gray-300 focus:outline-none focus:border-indigo-500 pb-0.5 cursor-pointer text-gray-900"
                disabled={isLoading || isSubmitting}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-medium text-gray-700">{localTimezone.replace(/_/g, ' ')}</span>
            </div>
          </div>
          
          <div className="mt-auto">
            <p className="text-xs text-gray-400">
              Times are shown in your local timezone automatically.
            </p>
          </div>
        </div>
        
        {/* Right Area - Slot Picker or Form */}
        <div className="w-full md:w-2/3 p-8 flex flex-col">
          {selectedSlot ? (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col">
              <button 
                onClick={() => setSelectedSlot(null)}
                className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-6 w-fit transition-colors"
                disabled={isSubmitting}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to slots
              </button>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Enter Details</h2>
              <div className="flex items-center gap-2 text-indigo-600 font-medium bg-indigo-50 px-4 py-2 rounded-md w-fit mb-8 border border-indigo-100">
                <Calendar className="w-4 h-4" />
                {format(selectedSlot.localDate, 'EEEE, d MMMM yyyy')}, {selectedSlot.formattedTime}
              </div>
              
              {submitError && (
                <div className="mb-6 rounded-md bg-red-50 p-4 border border-red-200">
                  <div className="flex">
                    <div className="shrink-0">
                      <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{submitError}</h3>
                    </div>
                  </div>
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-6 flex-1 flex flex-col">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
                  <input
                    type="text"
                    id="name"
                    required
                    disabled={isSubmitting}
                    className="block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 sm:text-sm transition-colors shadow-sm disabled:opacity-50"
                    placeholder="Your full name"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({...prev, name: e.target.value}))}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                  <input
                    type="email"
                    id="email"
                    required
                    disabled={isSubmitting}
                    className="block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 sm:text-sm transition-colors shadow-sm disabled:opacity-50"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={e => setFormData(prev => ({...prev, email: e.target.value}))}
                  />
                </div>
                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1.5">Reason for meeting *</label>
                  <input
                    type="text"
                    id="reason"
                    required
                    maxLength={100}
                    disabled={isSubmitting}
                    className="block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 sm:text-sm transition-colors shadow-sm disabled:opacity-50"
                    placeholder="e.g. Sales consultation, Support issue"
                    value={formData.reason}
                    onChange={e => setFormData(prev => ({...prev, reason: e.target.value}))}
                  />
                </div>
                <div>
                  <label htmlFor="summary" className="block text-sm font-medium text-gray-700 mb-1.5">Meeting summary / what would you like to discuss? *</label>
                  <textarea
                    id="summary"
                    required
                    maxLength={500}
                    rows={4}
                    disabled={isSubmitting}
                    className="block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 sm:text-sm transition-colors shadow-sm disabled:opacity-50 resize-none"
                    placeholder="Provide a brief summary of what you want to cover..."
                    value={formData.summary}
                    onChange={e => setFormData(prev => ({...prev, summary: e.target.value}))}
                  />
                </div>
                
                <div className="pt-4 mt-auto">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                  >
                    {isSubmitting ? 'Confirming...' : 'Confirm Booking'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Select a Time</h2>
              
              {isLoading ? (
                <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse">
                      <div className="h-5 bg-gray-200 rounded w-1/4 mb-4"></div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {[1, 2, 3].map(j => (
                          <div key={j} className="h-10 bg-gray-100 rounded border border-gray-200"></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : Object.keys(slots).length > 0 ? (
                <div className="flex-1 overflow-y-auto pr-2 space-y-8 pb-8 custom-scrollbar">
                  {Object.entries(slots).map(([day, daySlots]) => {
                    const parsedDay = parseISO(day)
                    return (
                      <div key={day}>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
                          {format(parsedDay, 'EEEE, d MMMM')}
                        </h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {daySlots.map((slot, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedSlot(slot)}
                              className="py-2.5 px-3 text-sm font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-all duration-150 text-center"
                            >
                              {slot.formattedTime}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Calendar className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">No times available</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    There are no available slots in the next 14 days.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
