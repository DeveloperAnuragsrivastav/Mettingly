import React from 'react'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

export default function AvailabilityEditor({ 
  data, 
  overrides, 
  setOverrides, 
  onSave, 
  isSaving,
  title,
  description
}) {
  const toggleOverride = (key) => {
    setOverrides(prev => {
      if (prev[key] !== null) {
        return { ...prev, [key]: null } // Revert to inherited
      } else {
        return { ...prev, [key]: data.resolved[key] } // Copy resolved to start customizing
      }
    })
  }
  
  const handleDayChange = (day, newBlocks) => {
    setOverrides(prev => ({
      ...prev,
      weekly_schedule: {
        ...prev.weekly_schedule,
        [day]: newBlocks
      }
    }))
  }

  const renderTimeBlocks = (blocks) => {
    if (!blocks || blocks.length === 0) return <span className="text-gray-500 italic">Unavailable</span>
    return blocks.map((b, i) => <span key={i} className="inline-block bg-gray-100 rounded px-2 py-1 text-sm mr-2 mb-2">{b[0]} - {b[1]}</span>)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>

      {/* General Settings */}
      <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-medium text-gray-900">General Rules</h2>
        </div>
        <div className="p-6 space-y-6">
          {['buffer_minutes', 'min_notice_minutes', 'max_booking_window_days'].map(key => {
            const isOverridden = overrides[key] !== null
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            
            return (
              <div key={key} className="flex items-center justify-between border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900">{label}</div>
                  <div className="text-sm text-gray-500">
                    {isOverridden ? 'Custom value' : `Inherited value: ${data.resolved[key]}`}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {isOverridden && (
                    <input 
                      type="number"
                      className="border border-gray-300 rounded px-3 py-1.5 text-sm w-24 focus:ring-indigo-500 focus:border-indigo-500"
                      value={overrides[key]}
                      onChange={(e) => setOverrides(prev => ({...prev, [key]: parseInt(e.target.value) || 0}))}
                    />
                  )}
                  <button
                    onClick={() => toggleOverride(key)}
                    className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                      isOverridden 
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' 
                        : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    {isOverridden ? 'Use Inherited' : 'Customize'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Weekly Schedule */}
      <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-medium text-gray-900">Weekly Schedule</h2>
          <button
            onClick={() => toggleOverride('weekly_schedule')}
            className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
              overrides.weekly_schedule !== null 
                ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' 
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            }`}
          >
            {overrides.weekly_schedule !== null ? 'Reset to Inherited' : 'Customize Schedule'}
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {DAYS.map(day => {
            const isCustomizing = overrides.weekly_schedule !== null
            const blocks = isCustomizing ? overrides.weekly_schedule[day] : data.resolved.weekly_schedule[day]
            
            return (
              <div key={day} className="p-6 flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="w-32 font-medium text-sm text-gray-900 flex items-center h-8 capitalize">
                  {DAY_NAMES[day]}
                </div>
                
                <div className="flex-1">
                  {!isCustomizing ? (
                    <div className="flex items-center min-h-[2rem]">
                      {renderTimeBlocks(blocks)}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {blocks.map((block, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input 
                            type="time" 
                            value={block[0]} 
                            onChange={(e) => {
                              const newBlocks = [...blocks]
                              newBlocks[idx] = [e.target.value, block[1]]
                              handleDayChange(day, newBlocks)
                            }}
                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <span className="text-gray-500">-</span>
                          <input 
                            type="time" 
                            value={block[1]} 
                            onChange={(e) => {
                              const newBlocks = [...blocks]
                              newBlocks[idx] = [block[0], e.target.value]
                              handleDayChange(day, newBlocks)
                            }}
                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <button
                            onClick={() => {
                              const newBlocks = blocks.filter((_, i) => i !== idx)
                              handleDayChange(day, newBlocks)
                            }}
                            className="ml-2 text-red-500 hover:text-red-700"
                            title="Remove time block"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const newBlocks = [...blocks, ["09:00", "17:00"]]
                          handleDayChange(day, newBlocks)
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 mt-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add hours
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors shadow-sm"
        >
          {isSaving ? 'Saving...' : 'Save Availability Overrides'}
        </button>
      </div>
    </div>
  )
}
