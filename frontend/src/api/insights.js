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
  }
}
