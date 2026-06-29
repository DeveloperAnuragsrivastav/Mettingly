import React, { useState, useEffect } from 'react'
import { insightsApi } from '../../api/insights'

export default function AuditLogPage() {
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(firstDay)
  const [endDate, setEndDate] = useState(lastDay)
  const [entityType, setEntityType] = useState('')
  
  const [logs, setLogs] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await insightsApi.getAuditLog(startDate, endDate, entityType || null)
        setLogs(res.items || [])
      } catch (err) {
        console.error("Failed to fetch audit logs", err)
        setError("Failed to load audit logs.")
      } finally {
        setIsLoading(false)
      }
    }

    if (startDate && endDate) {
      fetchLogs()
    }
  }, [startDate, endDate, entityType])

  const renderStateDiff = (action, before, after) => {
    if (!before && !after) return <span className="text-gray-400 italic">No details</span>
    
    // Quick and readable diffs for known actions
    if (action === 'member_role_changed') {
      return (
        <span>
          role: <span className="text-gray-500 line-through">{before?.role || 'none'}</span> 
          <span className="mx-2">→</span> 
          <span className="font-medium text-indigo-600">{after?.role}</span>
        </span>
      )
    }
    
    if (action.startsWith('booking_')) {
      if (action === 'booking_rescheduled') {
        return (
          <span>
            time: <span className="text-gray-500 line-through text-xs">{before?.start_time_utc}</span>
            <span className="mx-1">→</span>
            <span className="font-medium text-indigo-600 text-xs">{after?.start_time_utc}</span>
          </span>
        )
      }
      return (
        <span className="text-xs text-gray-600">
          status: <span className="font-medium text-gray-900">{after?.status || 'unknown'}</span>
        </span>
      )
    }
    
    // Fallback for generic dict differences
    if (before && after) {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)])
      const changes = []
      keys.forEach(k => {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
          changes.push(`${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`)
        }
      })
      if (changes.length > 0) {
        return <div className="text-xs text-gray-600 truncate max-w-xs" title={changes.join(', ')}>{changes[0]} {changes.length > 1 ? '(+ more)' : ''}</div>
      }
    }
    
    // Fallback to raw JSON if it's just an after state (creation event)
    if (after) {
      return <div className="text-xs text-gray-500 truncate max-w-xs">{JSON.stringify(after)}</div>
    }
    
    return <span className="text-gray-400 italic">Unknown state</span>
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track system changes and administrative actions.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
          <select
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
            className="text-sm border-gray-300 rounded-md py-1.5 pl-3 pr-8 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50"
          >
            <option value="">All Entities</option>
            <option value="organization">Organization</option>
            <option value="member">Member</option>
            <option value="team">Team</option>
            <option value="booking">Booking</option>
            <option value="job">Background Job</option>
          </select>
          <div className="h-6 w-px bg-gray-200" />
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border-none text-sm focus:ring-0 text-gray-700 bg-transparent py-1.5"
            />
            <span className="text-gray-400">to</span>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border-none text-sm focus:ring-0 text-gray-700 bg-transparent py-1.5"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actor</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Entity</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {isLoading && !logs ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">Loading audit logs...</td>
                </tr>
              ) : logs?.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No activity found for this period.</td>
                </tr>
              ) : (
                logs?.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.created_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {log.members?.full_name || (log.actor_member_id === null ? 'System' : 'Unknown')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize border border-gray-200">
                        {log.entity_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.action}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {renderStateDiff(log.action, log.before_state, log.after_state)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
