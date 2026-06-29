import { apiClient } from './client'

export const availabilityApi = {
  getMe: async () => {
    const res = await apiClient.get('/availability/me')
    return res.data
  },

  updateMe: async (payload) => {
    const res = await apiClient.put('/availability/me', payload)
    return res.data
  },

  getDateBlocks: async () => {
    const res = await apiClient.get('/availability/me/date-blocks')
    return res.data
  },

  createDateBlock: async (payload) => {
    const res = await apiClient.post('/availability/me/date-blocks', payload)
    return res.data
  },

  deleteDateBlock: async (blockId) => {
    await apiClient.delete(`/availability/me/date-blocks/${blockId}`)
  },

  getTeam: async (teamId) => {
    const res = await apiClient.get(`/availability/team/${teamId}`)
    return res.data
  },

  updateTeam: async (teamId, payload) => {
    const res = await apiClient.put(`/availability/team/${teamId}`, payload)
    return res.data
  },
}
