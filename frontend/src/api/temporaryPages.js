import { apiClient } from './client'

export const temporaryPagesApi = {
  createPage: async (payload) => {
    const response = await apiClient.post('/temporary-pages', payload)
    return response.data
  },

  listPages: async () => {
    const response = await apiClient.get('/temporary-pages')
    return response.data
  },

  deactivatePage: async (pageId) => {
    const response = await apiClient.patch(`/temporary-pages/${pageId}`, {
      deactivation_reason: 'manual'
    })
    return response.data
  }
}
