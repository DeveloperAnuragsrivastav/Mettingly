import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, addDays, parseISO } from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { manageApi } from '../../api/manage'
import { bookingApi } from '../../api/booking'
import { Calendar, Clock, Globe, ArrowLeft, AlertCircle, X, Repeat, Video } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ManageBookingPage() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [booking, setBooking] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Modes: 'view', 'cancel', 'reschedule'
  const [mode, setMode] = useState('view')
  
  // Cancel state
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  
  // Reschedule state
  const [slots, setSlots] = useState({})
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [isRescheduling, setIsRescheduling] = useState(false)
  
  // Detect local timezone
  const localTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (e) {
      return 'UTC'
    }
  }, [])

  const loadBooking = async () => {
    try {
      setIsLoading(true)
      const data = await manageApi.getBookingByToken(token)
      setBooking(data)
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Booking not found or invalid link.')
      } else {
        setError('Failed to load booking details.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadBooking()
  }, [token])

  const handleCancel = async () => {
    try {
      setIsCancelling(true)
      await manageApi.cancelBooking(token, cancelReason)
      setMode('view')
      toast.success('Booking cancelled successfully')
      await loadBooking() // Refresh state
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel booking.')
    } finally {
      setIsCancelling(false)
    }
  }

  const startReschedule = async () => {
    setMode('reschedule')
    try {
      setIsLoadingSlots(true)
      const today = new Date()
      const rangeStart = format(today, 'yyyy-MM-dd')
      const rangeEnd = format(addDays(today, 14), 'yyyy-MM-dd')
      
      const data = await bookingApi.getTeamSlots(booking.team_slug, booking.duration_minutes, rangeStart, rangeEnd)
      
      const grouped = {}
      if (data.slots) {
        Object.keys(data.slots).forEach(utcTimeString => {
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
      
      Object.keys(grouped).forEach(day => {
        grouped[day].sort((a, b) => a.localDate.getTime() - b.localDate.getTime())
      })
      
      setSlots(grouped)
    } catch (err) {
      toast.error('Failed to load available slots for rescheduling.')
      setMode('view')
    } finally {
      setIsLoadingSlots(false)
    }
  }

  const handleReschedule = async () => {
    if (!selectedSlot) return
    try {
      setIsRescheduling(true)
      await manageApi.rescheduleBooking(token, selectedSlot.utcStr)
      toast.success('Booking rescheduled successfully')
      setMode('view')
      setSelectedSlot(null)
      await loadBooking()
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error('This slot is no longer available. Please select another time.')
        setSelectedSlot(null)
        startReschedule() // Reload slots
      } else {
        toast.error(err.response?.data?.detail || 'Failed to reschedule booking.')
      }
    } finally {
      setIsRescheduling(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded w-96"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">{error}</h3>
        </div>
      </div>
    )
  }

  const localStart = toZonedTime(parseISO(booking.start_time), localTimezone)
  const isPast = new Date() > localStart

  if (!booking.actionable || isPast) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-20 px-4 sm:px-6 lg:px-8 font-sans">
        <div className="max-w-xl w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden p-8 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 mb-4">
            <Calendar className="h-6 w-6 text-gray-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Booking No Longer Active</h2>
          <p className="text-gray-500 mb-8">
            This booking is in status <strong>{booking.status}</strong> and cannot be managed further.
          </p>
          <div className="bg-gray-50 p-4 rounded-md text-left inline-block w-full">
            <p className="text-sm font-medium text-gray-900">{booking.team_name} Meeting</p>
            <p className="text-sm text-gray-500 mt-1">{format(localStart, 'EEEE, d MMMM yyyy, h:mm a')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center pt-20 px-4 sm:px-6 lg:px-8 font-sans pb-20">
      <div className="max-w-3xl w-full">
        
        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-1/3 bg-gray-50 p-8 border-r border-gray-100">
             <h2 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Manage Booking</h2>
             <h1 className="text-xl font-bold text-gray-900 mb-6">{booking.team_name}</h1>
             
             <div className="space-y-4 text-gray-600">
               <div className="flex items-start gap-3">
                 <Calendar className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                 <div>
                   <p className="font-medium text-gray-900">{format(localStart, 'd MMMM yyyy')}</p>
                   <p className="text-sm">{format(localStart, 'h:mm a')} ({localTimezone})</p>
                 </div>
               </div>
               <div className="flex items-center gap-3">
                 <Clock className="w-5 h-5 text-gray-400 shrink-0" />
                 <span className="text-sm font-medium text-gray-900">{booking.duration_minutes} minutes</span>
               </div>
               {booking.google_meet_link && (
                 <div className="flex items-start gap-3">
                   <Video className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                   <div>
                     <p className="text-sm font-medium text-gray-900">Google Meet</p>
                     <a href={booking.google_meet_link} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:text-indigo-500 truncate block max-w-[150px]">
                       {booking.google_meet_link}
                     </a>
                   </div>
                 </div>
               )}
             </div>
          </div>
          
          <div className="w-full md:w-2/3 p-8">
            {mode === 'view' && (
              <div className="h-full flex flex-col justify-center animate-in fade-in">
                <h2 className="text-lg font-medium text-gray-900 mb-6 text-center">What would you like to do?</h2>
                <div className="space-y-4 max-w-sm mx-auto w-full">
                  <button
                    onClick={startReschedule}
                    className="w-full flex items-center justify-center py-3 px-4 border border-indigo-200 rounded-md shadow-sm text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    <Repeat className="w-4 h-4 mr-2" />
                    Reschedule
                  </button>
                  <button
                    onClick={() => setMode('cancel')}
                    className="w-full flex items-center justify-center py-3 px-4 border border-red-200 rounded-md shadow-sm text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel Booking
                  </button>
                </div>
              </div>
            )}
            
            {mode === 'cancel' && (
              <div className="animate-in slide-in-from-right-4 h-full flex flex-col">
                <button 
                  onClick={() => setMode('view')}
                  className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 w-fit mb-6"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </button>
                <h2 className="text-lg font-bold text-gray-900 mb-2">Cancel Booking</h2>
                <p className="text-sm text-gray-500 mb-6">Are you sure you want to cancel this booking? This action cannot be undone.</p>
                
                <textarea
                  className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm mb-6"
                  rows={4}
                  placeholder="Reason for cancellation (optional)"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                />
                
                <button
                  onClick={handleCancel}
                  disabled={isCancelling}
                  className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            )}
            
            {mode === 'reschedule' && (
              <div className="animate-in slide-in-from-right-4 h-full flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <button 
                    onClick={() => {
                      if (selectedSlot) setSelectedSlot(null)
                      else setMode('view')
                    }}
                    className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 w-fit"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back
                  </button>
                  <h2 className="text-lg font-bold text-gray-900">Reschedule</h2>
                </div>
                
                {selectedSlot ? (
                  <div className="flex-1 flex flex-col justify-center animate-in fade-in">
                    <div className="text-center mb-8">
                      <p className="text-sm text-gray-500 mb-2">New time selected:</p>
                      <div className="inline-flex items-center gap-2 text-indigo-700 font-medium bg-indigo-50 px-4 py-2 rounded-md border border-indigo-100">
                        {format(selectedSlot.localDate, 'EEEE, d MMMM yyyy')}, {selectedSlot.formattedTime}
                      </div>
                    </div>
                    <button
                      onClick={handleReschedule}
                      disabled={isRescheduling}
                      className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {isRescheduling ? 'Rescheduling...' : 'Confirm New Time'}
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col">
                    {isLoadingSlots ? (
                      <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                        {[1, 2].map(i => (
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
                                    className="py-2.5 px-3 text-sm font-medium text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all text-center"
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
                        <Calendar className="w-8 h-8 text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">No times available</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          There are no available slots in the next 14 days.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  )
}
