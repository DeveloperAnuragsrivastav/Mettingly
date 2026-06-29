import { apiClient } from './client'

export const membersApi = {
  listMembers: async () => {
    const response = await apiClient.get('/members')
    return response.data
  },

  inviteMember: async (payload) => {
    const response = await apiClient.post('/members/invite', payload)
    return response.data
  },

  deleteMember: async (memberId) => {
    const response = await apiClient.delete(`/members/${memberId}`)
    return response.data
  },

  updateMemberRole: async (memberId, newRole) => {
    const response = await apiClient.patch(`/members/${memberId}/role`, {
      new_role: newRole
    })
    return response.data
  },

  toggleMemberActive: async (memberId, isActive) => {
    const response = await apiClient.patch(`/members/${memberId}/toggle-active`, {
      is_active_for_booking: isActive
    })
    return response.data
  }
}
