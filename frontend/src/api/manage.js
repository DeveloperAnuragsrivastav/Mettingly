import { apiClient } from './client'

export const manageApi = {
  getBookingByToken: async (token) => {
    const res = await apiClient.get(`/manage/${token}`)
    return res.data
  },

  cancelBooking: async (token, reason) => {
    const res = await apiClient.post(`/manage/${token}/cancel`, { reason })
    return res.data
  },

  rescheduleBooking: async (token, newSlotStartUtc) => {
    const res = await apiClient.post(`/manage/${token}/reschedule`, { new_slot_start_utc: newSlotStartUtc })
    return res.data
  },
}
