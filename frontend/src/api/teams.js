import { apiClient } from './client'

export const teamsApi = {
  listTeams: async () => {
    const response = await apiClient.get('/teams')
    return response.data
  },

  createTeam: async (payload) => {
    const response = await apiClient.post('/teams', payload)
    return response.data
  },

  updateTeam: async (teamId, payload) => {
    const response = await apiClient.patch(`/teams/${teamId}`, payload)
    return response.data
  }
}
