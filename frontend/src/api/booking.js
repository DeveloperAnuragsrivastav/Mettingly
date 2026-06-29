import { apiClient } from './client'

export const bookingApi = {
  getTeamSlots: async (teamSlug, durationMinutes, rangeStart, rangeEnd) => {
    const params = new URLSearchParams({
      duration_minutes: durationMinutes.toString(),
      range_start: rangeStart,
      range_end: rangeEnd
    })
    const res = await apiClient.get(`/book/${teamSlug}/slots?${params.toString()}`)
    return res.data
  },

  createBooking: async (teamSlug, payload) => {
    const res = await apiClient.post(`/book/${teamSlug}`, payload)
    return res.data
  },

  getCampaignSlots: async (campaignSlug, rangeStart, rangeEnd) => {
    const params = new URLSearchParams({
      range_start: rangeStart,
      range_end: rangeEnd
    })
    const res = await apiClient.get(`/campaign/${campaignSlug}/slots?${params.toString()}`)
    return res.data
  },

  createCampaignBooking: async (campaignSlug, payload) => {
    const res = await apiClient.post(`/campaign/${campaignSlug}`, payload)
    return res.data
  },
}
