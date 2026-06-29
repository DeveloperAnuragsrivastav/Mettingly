import { apiClient } from './client'

export const platformApi = {
  listOrganizations: async () => {
    const response = await apiClient.get('/platform/organizations')
    return response.data
  },

  createOrganization: async (payload) => {
    const response = await apiClient.post('/platform/organizations', payload)
    return response.data
  },

  bootstrapSuperAdmin: async (orgId, payload) => {
    const response = await apiClient.post(`/platform/organizations/${orgId}/bootstrap-super-admin`, payload)
    return response.data
  },

  updateOrganization: async (orgId, payload) => {
    const response = await apiClient.patch(`/platform/organizations/${orgId}`, payload)
    return response.data
  }
}
