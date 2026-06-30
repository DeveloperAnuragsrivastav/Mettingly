import { apiClient } from './client'

export const insightsApi = {
  getUtilization: async (startDate, endDate) => {
    const res = await apiClient.get('/insights/utilization', {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    })
    return res.data
  },

  getBookings: async (startDate, endDate, status) => {
    const params = {
      start_date: startDate,
      end_date: endDate
    }
    if (status) {
      params.status = status
    }
    const res = await apiClient.get('/insights/bookings', { params })
    return res.data
  },

  getAuditLog: async (startDate, endDate, entityType) => {
    const params = {
      start_date: startDate,
      end_date: endDate
    }
    if (entityType) {
      params.entity_type = entityType
    }
    const res = await apiClient.get('/insights/audit-log', { params })
    return res.data
  },

  generateFollowup: async (bookingId, memberNotes, regenerate = false) => {
    const res = await apiClient.post(`/bookings/${bookingId}/generate-followup`, {
      member_notes: memberNotes,
      regenerate: regenerate
    })
    return res.data
  },

  generateNotes: async (bookingId, memberNotes, regenerate = false) => {
    const res = await apiClient.post(`/bookings/${bookingId}/generate-notes`, {
      member_notes: memberNotes,
      regenerate: regenerate
    })
    return res.data
  },

  updateActionItem: async (itemId, isDone) => {
    const res = await apiClient.patch(`/action-items/${itemId}`, {
      is_done: isDone
    })
    return res.data
  }
}
