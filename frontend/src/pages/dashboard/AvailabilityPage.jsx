import React, { useEffect, useState } from 'react'
import { availabilityApi } from '../../api/availability'
import AvailabilityEditor from '../../components/availability/AvailabilityEditor'
import toast from 'react-hot-toast'
import ConfirmDialog from '../../components/common/ConfirmDialog'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

export default function AvailabilityPage() {
  const [data, setData] = useState(null)
  const [dateBlocks, setDateBlocks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // Local edit state for overrides
  const [overrides, setOverrides] = useState({
    weekly_schedule: null, // null means use inherited
    buffer_minutes: null,
    min_notice_minutes: null,
    max_booking_window_days: null,
  })

  // Date block form state
  const [newBlock, setNewBlock] = useState({
    block_date: '',
    is_full_day: true,
    partial_start_time: '',
    partial_end_time: '',
    reason: ''
  })
  const [isAddingBlock, setIsAddingBlock] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, blockId: null })

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const [availRes, blocksRes] = await Promise.all([
        availabilityApi.getMe(),
        availabilityApi.getDateBlocks()
      ])
      
      setData(availRes)
      setDateBlocks(blocksRes)
      
      // Initialize overrides based on what exists
      const initialOverrides = {}
      
      if (availRes.member_override_exists.weekly_schedule) {
        initialOverrides.weekly_schedule = availRes.resolved.weekly_schedule
      } else {
        initialOverrides.weekly_schedule = null
      }
      
      ['buffer_minutes', 'min_notice_minutes', 'max_booking_window_days'].forEach(key => {
        if (availRes.member_override_exists[key]) {
          initialOverrides[key] = availRes.resolved[key]
        } else {
          initialOverrides[key] = null
        }
      })
      
      setOverrides(initialOverrides)
    } catch (err) {
      console.error('Failed to load availability', err)
      toast.error('Failed to load availability configuration.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSave = async () => {
    try {
      setIsSaving(true)
      await availabilityApi.updateMe(overrides)
      toast.success('Availability saved successfully!')
      await fetchData()
    } catch (err) {
      console.error('Failed to save availability', err)
      toast.error('Failed to save changes.')
    } finally {
      setIsSaving(false)
    }
  }

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

  const handleCreateBlock = async (e) => {
    e.preventDefault()
    try {
      setIsAddingBlock(true)
      await availabilityApi.createDateBlock(newBlock)
      setNewBlock({
        block_date: '',
        is_full_day: true,
        partial_start_time: '',
        partial_end_time: '',
        reason: ''
      })
      setDateBlocks(blocksRes)
      toast.success('Date block created.')
    } catch (err) {
      console.error('Failed to create date block', err)
      toast.error('Failed to create date block.')
    } finally {
      setIsAddingBlock(false)
    }
  }

  const handleDeleteBlock = async () => {
    const { blockId } = confirmDelete
    if (!blockId) return
    
    setConfirmDelete({ isOpen: false, blockId: null })
    try {
      await availabilityApi.deleteDateBlock(blockId)
      setDateBlocks(prev => prev.filter(b => b.id !== blockId))
      toast.success('Date block deleted.')
    } catch (err) {
      console.error('Failed to delete date block', err)
      toast.error('Failed to delete date block.')
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-64 bg-gray-200 rounded w-full"></div>
      </div>
    )
  }

  const renderTimeBlocks = (blocks) => {
    if (!blocks || blocks.length === 0) return <span className="text-gray-500 italic">Unavailable</span>
    return blocks.map((b, i) => <span key={i} className="inline-block bg-gray-100 rounded px-2 py-1 text-sm mr-2 mb-2">{b[0]} - {b[1]}</span>)
  }

  return (
    <div className="p-8 max-w-5xl space-y-8 pb-20">
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Delete Date Block"
        message="Are you sure you want to delete this date block? Your regular weekly availability will resume for this date."
        confirmText="Delete"
        onConfirm={handleDeleteBlock}
        onCancel={() => setConfirmDelete({ isOpen: false, blockId: null })}
      />
      
      <AvailabilityEditor
        data={data}
        overrides={overrides}
        setOverrides={setOverrides}
        onSave={handleSave}
        isSaving={isSaving}
        title="My Availability"
        description="Manage your working hours and time off. You can override the team or organization defaults."
      />

      {/* Date Blocks */}
      <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden mt-12">
        <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
          <h2 className="text-lg font-medium text-gray-900">Time Off & Specific Dates</h2>
          <p className="text-sm text-gray-500 mt-1">Block out entire days or partial days for vacation, holidays, or personal time.</p>
        </div>
        
        <div className="p-6">
          <form onSubmit={handleCreateBlock} className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-8 space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Add Date Block</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                <input 
                  type="date" 
                  required
                  value={newBlock.block_date}
                  onChange={e => setNewBlock(prev => ({...prev, block_date: e.target.value}))}
                  className="block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. Vacation"
                  value={newBlock.reason}
                  onChange={e => setNewBlock(prev => ({...prev, reason: e.target.value}))}
                  className="block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500" 
                />
              </div>
              <div className="flex items-center mt-6">
                <input 
                  type="checkbox" 
                  id="full_day"
                  checked={newBlock.is_full_day}
                  onChange={e => setNewBlock(prev => ({...prev, is_full_day: e.target.checked}))}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="full_day" className="ml-2 block text-sm text-gray-900">
                  Full Day
                </label>
              </div>
              {!newBlock.is_full_day && (
                <div className="flex items-center gap-2 mt-6 lg:mt-0">
                  <input 
                    type="time" 
                    required={!newBlock.is_full_day}
                    value={newBlock.partial_start_time}
                    onChange={e => setNewBlock(prev => ({...prev, partial_start_time: e.target.value}))}
                    className="block w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500" 
                  />
                  <span className="text-gray-500">-</span>
                  <input 
                    type="time" 
                    required={!newBlock.is_full_day}
                    value={newBlock.partial_end_time}
                    onChange={e => setNewBlock(prev => ({...prev, partial_end_time: e.target.value}))}
                    className="block w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500" 
                  />
                </div>
              )}
            </div>
            <div>
              <button
                type="submit"
                disabled={isAddingBlock}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isAddingBlock ? 'Adding...' : 'Add Time Off'}
              </button>
            </div>
          </form>

          {dateBlocks.length > 0 ? (
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Date</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Type</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Reason</th>
                    <th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {dateBlocks.map((block) => (
                    <tr key={block.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        {block.block_date}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {block.is_full_day ? 'Full Day' : `${block.partial_start_time?.substring(0,5)} - ${block.partial_end_time?.substring(0,5)}`}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {block.reason || '-'}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button
                          onClick={() => setConfirmDelete({ isOpen: true, blockId: block.id })}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-gray-500">
              No upcoming time off scheduled.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
