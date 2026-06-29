import React, { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { availabilityApi } from '../../api/availability'
import { teamsApi } from '../../api/teams'
import AvailabilityEditor from '../../components/availability/AvailabilityEditor'
import toast from 'react-hot-toast'

export default function TeamAvailabilityPage() {
  const { identity } = useAuth()
  const isSuperAdmin = identity?.data?.role === 'super_admin'
  
  const [teams, setTeams] = useState([])
  const [selectedTeamId, setSelectedTeamId] = useState(isSuperAdmin ? '' : identity?.data?.team_id)
  
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  
  const [overrides, setOverrides] = useState({
    weekly_schedule: null,
    buffer_minutes: null,
    min_notice_minutes: null,
    max_booking_window_days: null,
  })

  // Fetch teams for dropdown if super admin
  useEffect(() => {
    if (isSuperAdmin) {
      teamsApi.listTeams().then(setTeams).catch(err => console.error('Failed to load teams', err))
    }
  }, [isSuperAdmin])

  // Fetch availability when team changes
  const fetchAvailability = async (teamId) => {
    if (!teamId) {
      setData(null)
      setIsLoading(false)
      return
    }
    
    try {
      setIsLoading(true)
      setError(null)
      const res = await availabilityApi.getTeam(teamId)
      setData(res)
      
      const initialOverrides = {}
      if (res.team_override_exists.weekly_schedule) {
        initialOverrides.weekly_schedule = res.resolved.weekly_schedule
      } else {
        initialOverrides.weekly_schedule = null
      }
      
      ['buffer_minutes', 'min_notice_minutes', 'max_booking_window_days'].forEach(key => {
        if (res.team_override_exists[key]) {
          initialOverrides[key] = res.resolved[key]
        } else {
          initialOverrides[key] = null
        }
      })
      
      setOverrides(initialOverrides)
    } catch (err) {
      console.error('Failed to load team availability', err)
      setError('Failed to load team availability configuration.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (selectedTeamId) {
      fetchAvailability(selectedTeamId)
    } else {
      setIsLoading(false)
    }
  }, [selectedTeamId])

  const handleSave = async () => {
    if (!selectedTeamId) return
    try {
      setIsSaving(true)
      await availabilityApi.updateTeam(selectedTeamId, overrides)
      toast.success('Team Availability saved successfully!')
      await fetchAvailability(selectedTeamId)
    } catch (err) {
      console.error('Failed to save team availability', err)
      toast.error('Failed to save changes.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl pb-20">
      {isSuperAdmin && (
        <div className="mb-8 p-6 bg-white shadow rounded-lg border border-gray-200">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Select Team</h2>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="block w-full max-w-md border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">-- Choose a team --</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {!selectedTeamId ? (
        <div className="text-gray-500 italic">Please select a team to manage its availability.</div>
      ) : isLoading ? (
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded w-full"></div>
        </div>
      ) : error ? (
        <div className="text-red-600 bg-red-50 p-4 rounded-md">{error}</div>
      ) : data ? (
        <AvailabilityEditor
          data={data}
          overrides={overrides}
          setOverrides={setOverrides}
          onSave={handleSave}
          isSaving={isSaving}
          title={isSuperAdmin ? "Team Availability Overrides" : "My Team's Availability"}
          description="Manage working hours and rules for this team. These settings override the organization defaults and apply to all team members unless they have personal overrides."
        />
      ) : null}
    </div>
  )
}
