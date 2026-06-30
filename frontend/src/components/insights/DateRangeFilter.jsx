import React, { useState, useRef, useEffect } from 'react'
import { subDays, startOfMonth, endOfMonth, subMonths, format, startOfDay, endOfDay } from 'date-fns'

const PRESETS = [
  { label: 'Today', id: 'today' },
  { label: 'Yesterday', id: 'yesterday' },
  { label: 'Last 7 days', id: 'last7' },
  { label: 'Last 30 days', id: 'last30' },
  { label: 'This month', id: 'thisMonth' },
  { label: 'Last month', id: 'lastMonth' },
  { label: 'Custom range', id: 'custom' },
]

function toYMD(date) {
  return format(date, 'yyyy-MM-dd')
}

function computePreset(id) {
  const now = new Date()
  switch (id) {
    case 'today':      return { start: toYMD(startOfDay(now)), end: toYMD(endOfDay(now)) }
    case 'yesterday':  { const y = subDays(now, 1); return { start: toYMD(y), end: toYMD(y) } }
    case 'last7':      return { start: toYMD(subDays(now, 6)), end: toYMD(now) }
    case 'last30':     return { start: toYMD(subDays(now, 29)), end: toYMD(now) }
    case 'thisMonth':  return { start: toYMD(startOfMonth(now)), end: toYMD(endOfMonth(now)) }
    case 'lastMonth':  { const lm = subMonths(now, 1); return { start: toYMD(startOfMonth(lm)), end: toYMD(endOfMonth(lm)) } }
    default:           return null
  }
}

/**
 * Calendly/Linear-style preset date range picker.
 *
 * Props:
 *   startDate  — string YYYY-MM-DD (controlled)
 *   endDate    — string YYYY-MM-DD (controlled)
 *   onChange   — (startDate, endDate) => void
 */
export default function DateRangeFilter({ startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false)
  const [activePreset, setActivePreset] = useState('thisMonth')
  const [customStart, setCustomStart] = useState(startDate)
  const [customEnd, setCustomEnd] = useState(endDate)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function handlePreset(id) {
    setActivePreset(id)
    if (id === 'custom') return // stay open, show date inputs
    const range = computePreset(id)
    if (range) onChange(range.start, range.end)
    setOpen(false)
  }

  function handleCustomApply() {
    if (customStart && customEnd && customStart <= customEnd) {
      onChange(customStart, customEnd)
      setOpen(false)
    }
  }

  const activeLabel = activePreset === 'custom'
    ? `${startDate} – ${endDate}`
    : PRESETS.find(p => p.id === activePreset)?.label || 'Select range'

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 shadow-sm hover:border-indigo-400 hover:text-indigo-700 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>
        </svg>
        <span className="font-medium">{activeLabel}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 min-w-[200px] overflow-hidden">
          <ul className="py-1">
            {PRESETS.map(p => (
              <li key={p.id}>
                <button
                  onClick={() => handlePreset(p.id)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    activePreset === p.id
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>

          {/* Custom range sub-panel */}
          {activePreset === 'custom' && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">From</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">To</label>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                onClick={handleCustomApply}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="w-full mt-1 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
