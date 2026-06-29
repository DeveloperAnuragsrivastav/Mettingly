import React, { useState, useEffect } from 'react'
import { temporaryPagesApi } from '../../api/temporaryPages'
import { Link2, Clock, Trash2, Plus, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmDialog from '../../components/common/ConfirmDialog'

const FRONTEND_URL = window.location.origin

export default function TemporaryPagesPage() {
  const [pages, setPages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copiedSlug, setCopiedSlug] = useState(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState({ isOpen: false, id: null })

  // Form state
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [duration, setDuration] = useState(30)
  const [expiryType, setExpiryType] = useState('never') // never, specific_date, after_days, after_bookings
  const [expiryDate, setExpiryDate] = useState('')
  const [expiryAfterDays, setExpiryAfterDays] = useState(7)
  const [expiryAfterBookings, setExpiryAfterBookings] = useState(10)

  const fetchPages = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await temporaryPagesApi.listPages()
      setPages(res.items || [])
    } catch (err) {
      setError('Failed to load campaigns.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPages()
  }, [])

  // Auto-generate slug from title
  useEffect(() => {
    if (title && !isSubmitting) {
      const generated = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
      setSlug(generated)
    }
  }, [title])

  const handleCreate = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const payload = {
      title,
      slug,
      duration_minutes: duration,
      expiry_type: expiryType
    }

    if (expiryType === 'specific_date') payload.expiry_date = expiryDate
    if (expiryType === 'after_days') payload.expiry_after_days = parseInt(expiryAfterDays, 10)
    if (expiryType === 'after_bookings') payload.expiry_after_bookings = parseInt(expiryAfterBookings, 10)

    try {
      await temporaryPagesApi.createPage(payload)
      setIsModalOpen(false)
      // Reset form
      setTitle('')
      setSlug('')
      setDuration(30)
      setExpiryType('never')
      fetchPages()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create campaign')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeactivate = async () => {
    const { id } = confirmDeactivate
    if (!id) return
    
    setConfirmDeactivate({ isOpen: false, id: null })
    try {
      await temporaryPagesApi.deactivatePage(id)
      fetchPages()
      toast.success('Campaign deactivated.')
    } catch (err) {
      toast.error('Failed to deactivate campaign.')
    }
  }

  const copyLink = (slug) => {
    const url = `${FRONTEND_URL}/campaign/${slug}`
    navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  const renderExpirySummary = (page) => {
    if (page.expiry_type === 'never') return "Never"
    if (page.expiry_type === 'specific_date') return `Expires ${new Date(page.expiry_date).toLocaleDateString()}`
    if (page.expiry_type === 'after_days') {
      const creationDate = new Date(page.created_at)
      const expiry = new Date(creationDate.getTime() + page.expiry_after_days * 24 * 60 * 60 * 1000)
      return `Expires in ${page.expiry_after_days} days (${expiry.toLocaleDateString()})`
    }
    if (page.expiry_type === 'after_bookings') return `Expires after ${page.expiry_after_bookings} bookings (${page.current_booking_count}/${page.expiry_after_bookings} used)`
    return "Unknown"
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 pb-20">
      <ConfirmDialog
        isOpen={confirmDeactivate.isOpen}
        title="Deactivate Campaign"
        message="Are you sure you want to deactivate this campaign link? It will no longer accept bookings."
        confirmText="Deactivate"
        onConfirm={handleDeactivate}
        onCancel={() => setConfirmDeactivate({ isOpen: false, id: null })}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaign Links</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create temporary, org-wide booking links for marketing campaigns or events.
          </p>
        </div>
        
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Campaign
        </button>
      </div>

      {error && !isModalOpen && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Campaign</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expiry</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">Loading campaigns...</td>
                </tr>
              ) : pages.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No campaigns created yet.</td>
                </tr>
              ) : (
                pages.map(page => {
                  const isExpired = !page.is_active
                  return (
                    <tr key={page.id} className={`hover:bg-gray-50/50 transition-colors ${isExpired ? 'opacity-60' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{page.title}</div>
                        <div className="text-sm text-gray-500 flex items-center mt-1">
                          <Link2 className="h-3 w-3 mr-1" />
                          /campaign/{page.slug}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-gray-400 mr-1.5" />
                          {page.duration_minutes} min
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {renderExpirySummary(page)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {page.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {page.deactivation_reason === 'manual' ? 'Manually Deactivated' : 'Expired'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => copyLink(page.slug)}
                            className="text-gray-400 hover:text-gray-600 focus:outline-none flex items-center gap-1"
                            title="Copy link"
                          >
                            {copiedSlug === page.slug ? (
                              <><Check className="h-4 w-4 text-green-500" /> <span className="text-xs text-green-600">Copied</span></>
                            ) : (
                              <><Copy className="h-4 w-4" /> <span className="text-xs">Copy</span></>
                            )}
                          </button>
                          {page.is_active && (
                            <button
                              onClick={() => setConfirmDeactivate({ isOpen: true, id: page.id })}
                              className="text-red-400 hover:text-red-600 ml-4 focus:outline-none"
                              title="Deactivate"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 overflow-hidden">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Create Campaign Link</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-md">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  placeholder="e.g. Summer Webinar Follow-up"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug</label>
                <div className="flex rounded-md shadow-sm">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                    {FRONTEND_URL}/campaign/
                  </span>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Link Expiry</label>
                <div className="space-y-3">
                  <label className="flex items-center text-sm text-gray-700">
                    <input type="radio" value="never" checked={expiryType === 'never'} onChange={() => setExpiryType('never')} className="text-indigo-600 focus:ring-indigo-500 mr-2" />
                    Never
                  </label>
                  <label className="flex items-center text-sm text-gray-700">
                    <input type="radio" value="specific_date" checked={expiryType === 'specific_date'} onChange={() => setExpiryType('specific_date')} className="text-indigo-600 focus:ring-indigo-500 mr-2" />
                    Specific Date
                  </label>
                  {expiryType === 'specific_date' && (
                    <div className="pl-6 pt-1">
                      <input type="date" required value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="border-gray-300 rounded-md text-sm" />
                    </div>
                  )}
                  
                  <label className="flex items-center text-sm text-gray-700">
                    <input type="radio" value="after_days" checked={expiryType === 'after_days'} onChange={() => setExpiryType('after_days')} className="text-indigo-600 focus:ring-indigo-500 mr-2" />
                    After a number of days
                  </label>
                  {expiryType === 'after_days' && (
                    <div className="pl-6 pt-1 flex items-center gap-2 text-sm text-gray-500">
                      <input type="number" min="1" required value={expiryAfterDays} onChange={(e) => setExpiryAfterDays(e.target.value)} className="w-20 border-gray-300 rounded-md text-sm" />
                      days
                    </div>
                  )}

                  <label className="flex items-center text-sm text-gray-700">
                    <input type="radio" value="after_bookings" checked={expiryType === 'after_bookings'} onChange={() => setExpiryType('after_bookings')} className="text-indigo-600 focus:ring-indigo-500 mr-2" />
                    After a set number of bookings
                  </label>
                  {expiryType === 'after_bookings' && (
                    <div className="pl-6 pt-1 flex items-center gap-2 text-sm text-gray-500">
                      <input type="number" min="1" required value={expiryAfterBookings} onChange={(e) => setExpiryAfterBookings(e.target.value)} className="w-24 border-gray-300 rounded-md text-sm" />
                      bookings
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
