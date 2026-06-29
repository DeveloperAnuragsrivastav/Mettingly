import React from 'react'
import { useLocation, Link, Navigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { CheckCircle, Calendar, Video, Clock, Mail } from 'lucide-react'

export default function BookingConfirmation() {
  const location = useLocation()
  
  if (!location.state || !location.state.booking) {
    return <Navigate to="/" replace />
  }

  const { booking, localTimezone, slotStart, duration } = location.state
  
  const dateUtc = parseISO(slotStart)
  const localDate = toZonedTime(dateUtc, localTimezone)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          
          <div className="text-center mb-8">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
            <p className="mt-2 text-sm text-gray-500">
              You're scheduled with {booking.assigned_member_id ? 'a team member' : 'the team'}.
            </p>
          </div>
          
          <div className="border border-gray-200 rounded-lg p-6 bg-gray-50 mb-8 space-y-4">
            <div className="flex items-start">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5 mr-3 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {format(localDate, 'EEEE, d MMMM yyyy')}
                </p>
                <p className="text-sm text-gray-500">
                  {format(localDate, 'h:mm a')} ({localTimezone.replace(/_/g, ' ')})
                </p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Clock className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
              <p className="text-sm font-medium text-gray-900">{duration} minutes</p>
            </div>
            
            {booking.google_meet_link && (
              <div className="flex items-start">
                <Video className="w-5 h-5 text-gray-400 mt-0.5 mr-3 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Google Meet</p>
                  <a href={booking.google_meet_link} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:text-indigo-500 truncate block max-w-[250px]">
                    {booking.google_meet_link}
                  </a>
                </div>
              </div>
            )}
          </div>
          
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4" />
              A calendar invitation has been sent to your email.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
