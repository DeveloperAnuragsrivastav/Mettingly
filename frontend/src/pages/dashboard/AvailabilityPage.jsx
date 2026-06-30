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
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl mt-12">
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-bright/50 rounded-t-xl">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-1">Time Off &amp; Specific Dates</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Block out entire days or partial days for vacation, holidays, or personal time.</p>
        </div>
        
        <div className="p-6">
          <form onSubmit={handleCreateBlock} className="bg-surface-bright border border-outline-variant rounded-xl p-6 mb-8 space-y-4">
            <h4 className="font-label-md text-label-md text-on-surface mb-4">Add Date Block</h4>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
              <div className="md:col-span-4">
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1.5">Date</label>
                <input 
                  type="date" 
                  required
                  value={newBlock.block_date}
                  onChange={e => setNewBlock(prev => ({...prev, block_date: e.target.value}))}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-shadow" 
                />
              </div>
              <div className="md:col-span-5">
                <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1.5">Reason (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. Vacation"
                  value={newBlock.reason}
                  onChange={e => setNewBlock(prev => ({...prev, reason: e.target.value}))}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-shadow" 
                />
              </div>
              <div className="md:col-span-3 flex items-center gap-4 pb-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    id="full_day"
                    checked={newBlock.is_full_day}
                    onChange={e => setNewBlock(prev => ({...prev, is_full_day: e.target.checked}))}
                    className="peer appearance-none w-5 h-5 border border-outline-variant rounded bg-surface-container-lowest checked:bg-primary checked:border-primary transition-colors cursor-pointer focus:ring-2 focus:ring-primary/20 focus:outline-none"
                  />
                  <span className="font-body-md text-body-md text-on-surface group-hover:text-primary transition-colors">Full Day</span>
                </label>
              </div>
            </div>

            {!newBlock.is_full_day && (
              <div className="flex items-center gap-3 pt-2">
                <div className="w-32">
                  <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1.5">Start Time</label>
                  <input 
                    type="time" 
                    required={!newBlock.is_full_day}
                    value={newBlock.partial_start_time}
                    onChange={e => setNewBlock(prev => ({...prev, partial_start_time: e.target.value}))}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-shadow" 
                  />
                </div>
                <span className="text-on-surface-variant pt-6">-</span>
                <div className="w-32">
                  <label className="block font-body-sm text-body-sm text-on-surface-variant mb-1.5">End Time</label>
                  <input 
                    type="time" 
                    required={!newBlock.is_full_day}
                    value={newBlock.partial_end_time}
                    onChange={e => setNewBlock(prev => ({...prev, partial_end_time: e.target.value}))}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-shadow" 
                  />
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isAddingBlock}
                className="px-5 py-2 bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md rounded-lg shadow-sm transition-all border border-primary/20 disabled:opacity-50"
              >
                {isAddingBlock ? 'Adding...' : 'Add Time Off'}
              </button>
            </div>
          </form>

          {dateBlocks.length > 0 ? (
            <div className="overflow-hidden border border-outline-variant rounded-xl shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-bright">
                    <th className="py-3 px-6 font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">Date</th>
                    <th className="py-3 px-6 font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">Type</th>
                    <th className="py-3 px-6 font-label-md text-label-md text-on-surface-variant font-medium tracking-wide uppercase text-[11px]">Reason</th>
                    <th className="relative py-3 px-6 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant bg-surface-container-lowest">
                  {dateBlocks.map((block) => (
                    <tr key={block.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="whitespace-nowrap py-4 px-6 text-sm font-medium text-on-surface">
                        {block.block_date}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-on-surface-variant">
                        {block.is_full_day ? 'Full Day' : `${block.partial_start_time?.substring(0,5)} - ${block.partial_end_time?.substring(0,5)}`}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-on-surface-variant">
                        {block.reason || '-'}
                      </td>
                      <td className="relative whitespace-nowrap py-4 px-6 text-right text-sm font-medium">
                        <button
                          onClick={() => setConfirmDelete({ isOpen: true, blockId: block.id })}
                          className="text-error hover:text-red-700 transition-colors"
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
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <p className="font-body-md text-body-md text-on-surface-variant">No upcoming time off scheduled.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
