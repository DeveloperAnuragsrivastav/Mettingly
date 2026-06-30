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
    <div className="space-y-xl pb-6 fade-in">
      <div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">{title}</h2>
        {description && (
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">{description}</p>
        )}
      </div>

      {/* General Rules Card */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl">
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-bright/50 rounded-t-xl">
          <h3 className="font-headline-md text-headline-md text-on-surface">General Rules</h3>
        </div>
        <div className="divide-y divide-outline-variant">
          {['buffer_minutes', 'min_notice_minutes', 'max_booking_window_days'].map(key => {
            const isOverridden = overrides[key] !== null
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            
            return (
              <div key={key} className="px-6 py-4 flex items-center justify-between hover:bg-surface-bright transition-colors">
                <div>
                  <div className="font-label-md text-label-md text-on-surface mb-1">{label}</div>
                  <div className="font-body-sm text-body-sm text-on-surface-variant">
                    {isOverridden ? 'Custom value overridden' : `Inherited value: ${data.resolved[key]}`}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {isOverridden && (
                    <input 
                      type="number"
                      className="border border-outline-variant bg-surface-container-lowest text-on-surface rounded px-3 py-1.5 text-sm w-24 focus:ring-primary focus:border-primary"
                      value={overrides[key]}
                      onChange={(e) => setOverrides(prev => ({...prev, [key]: parseInt(e.target.value) || 0}))}
                    />
                  )}
                  <button
                    onClick={() => toggleOverride(key)}
                    className="px-4 py-1.5 bg-secondary-fixed hover:bg-secondary-fixed-dim text-on-secondary-fixed font-label-md text-label-md rounded-lg transition-colors border border-outline-variant/30"
                  >
                    {isOverridden ? 'Use Inherited' : 'Customize'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Weekly Schedule Card */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl">
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-bright/50 rounded-t-xl flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-on-surface">Weekly Schedule</h3>
          <button
            onClick={() => toggleOverride('weekly_schedule')}
            className="px-4 py-1.5 bg-secondary-fixed hover:bg-secondary-fixed-dim text-on-secondary-fixed font-label-md text-label-md rounded-lg transition-colors border border-outline-variant/30"
          >
            {overrides.weekly_schedule !== null ? 'Reset to Inherited' : 'Customize Schedule'}
          </button>
        </div>
        <div className="divide-y divide-outline-variant">
          {DAYS.map((day, idx) => {
            const isCustomizing = overrides.weekly_schedule !== null
            const blocks = isCustomizing ? overrides.weekly_schedule[day] : data.resolved.weekly_schedule[day]
            const isWeekend = day === 'sat' || day === 'sun'
            const hasBlocks = blocks && blocks.length > 0
            
            return (
              <div 
                key={day} 
                className={`px-6 py-4 flex items-center grid grid-cols-12 hover:bg-surface-bright transition-colors ${
                  !hasBlocks ? 'opacity-60' : ''
                } ${idx === DAYS.length - 1 ? 'rounded-b-xl' : ''}`}
              >
                <div className={`col-span-3 font-label-md text-label-md capitalize ${
                  !hasBlocks ? 'text-on-surface-variant' : 'text-on-surface'
                }`}>
                  {DAY_NAMES[day]}
                </div>
                
                <div className="col-span-9">
                  {!isCustomizing ? (
                    <div className="flex flex-wrap gap-2">
                      {hasBlocks ? (
                        blocks.map((b, i) => (
                          <div key={i} className="px-3 py-1 bg-surface-variant/50 text-on-surface-variant rounded font-code text-code border border-outline-variant/30">
                            {b[0]} - {b[1]}
                          </div>
                        ))
                      ) : (
                        <span className="text-on-surface-variant italic text-xs">Unavailable</span>
                      )}
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
                            className="border border-outline-variant bg-surface-container-lowest text-on-surface rounded px-2 py-1 text-sm focus:ring-primary focus:border-primary"
                          />
                          <span className="text-on-surface-variant">-</span>
                          <input 
                            type="time" 
                            value={block[1]} 
                            onChange={(e) => {
                              const newBlocks = [...blocks]
                              newBlocks[idx] = [block[0], e.target.value]
                              handleDayChange(day, newBlocks)
                            }}
                            className="border border-outline-variant bg-surface-container-lowest text-on-surface rounded px-2 py-1 text-sm focus:ring-primary focus:border-primary"
                          />
                          <button
                            onClick={() => {
                              const newBlocks = blocks.filter((_, i) => i !== idx)
                              handleDayChange(day, newBlocks)
                            }}
                            className="ml-2 text-error hover:text-red-700 transition-colors"
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
                        className="text-sm text-primary hover:underline font-medium flex items-center gap-1 mt-2"
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
          className="px-6 py-2.5 bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-sm transition-all border border-primary/20 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Availability Overrides'}
        </button>
      </div>
    </div>
  )
}
