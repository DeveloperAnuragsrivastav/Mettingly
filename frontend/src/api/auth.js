import { apiClient } from './client'

export async function fetchPlatformMe() {
  const response = await apiClient.get('/platform/me')
  return response.data
}

export async function fetchMe() {
  const response = await apiClient.get('/me')
  return response.data
}
