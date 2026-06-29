import { apiClient } from './client'

export const calendarApi = {
  getStatus: async () => {
    const res = await apiClient.get('/calendar/status')
    return res.data
  },

  getConnectUrl: async (returnUrl) => {
    // Optionally pass return_url if backend supports it, otherwise rely on backend's defaults
    const url = returnUrl ? `/calendar/connect?return_url=${encodeURIComponent(returnUrl)}` : '/calendar/connect'
    const res = await apiClient.get(url)
    return res.data
  },
}
