import React, { useState, useEffect } from 'react';
import { teamsApi } from '../../api/teams';
import { format } from 'date-fns';
import { Plus, Users, Edit2, Check, X, AlertCircle, Copy, Link2 } from 'lucide-react';

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editError, setEditError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [copiedSlug, setCopiedSlug] = useState(null);
  const FRONTEND_URL = window.location.origin;

  const copyLink = (slug) => {
    const url = `${FRONTEND_URL}/book/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const fetchTeams = async () => {
    setIsLoading(true);
    try {
      const data = await teamsApi.listTeams();
      setTeams(data);
    } catch (err) {
      setError('Failed to load teams.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const handleNameChange = (e) => {
    const val = e.target.value;
    setNewName(val);
    if (!slugEdited) {
      setNewSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
      );
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);
    try {
      await teamsApi.createTeam({ name: newName, slug: newSlug });
      setIsModalOpen(false);
      setNewName('');
      setNewSlug('');
      setSlugEdited(false);
      fetchTeams();
    } catch (err) {
      if (err.response?.status === 409) {
        setCreateError('A team with this slug already exists.');
      } else {
        setCreateError('Failed to create team.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (team) => {
    setEditingId(team.id);
    setEditName(team.name);
    setEditSlug(team.slug);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditSlug('');
    setEditError(null);
  };

  const saveEdit = async (teamId) => {
    setIsSaving(true);
    setEditError(null);
    try {
      await teamsApi.updateTeam(teamId, { name: editName, slug: editSlug });
      setEditingId(null);
      fetchTeams();
    } catch (err) {
      if (err.response?.status === 409) {
        setEditError('Slug already exists.');
      } else {
        setEditError('Failed to update.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Teams</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your organization's teams.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <Plus className="w-4 h-4" />
          Create Team
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Slug
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Created At
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                  Loading teams...
                </td>
              </tr>
            ) : teams.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                  No teams found. Create your first team to get started.
                </td>
              </tr>
            ) : (
              teams.map((team) => (
                <tr key={team.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingId === team.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      />
                    ) : (
                      <div className="text-sm font-semibold text-gray-900">{team.name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingId === team.id ? (
                      <div>
                        <input
                          type="text"
                          value={editSlug}
                          onChange={(e) => setEditSlug(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
                        />
                        {editError && <p className="text-xs text-red-600 mt-1">{editError}</p>}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded inline-block font-mono">
                        /{team.slug}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(team.created_at), 'd MMMM yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {editingId === team.id ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => saveEdit(team.id)}
                          disabled={isSaving}
                          className="text-emerald-600 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 p-1.5 rounded transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2 items-center">
                        <button
                          onClick={() => copyLink(team.slug)}
                          className="text-gray-500 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 p-1.5 rounded inline-flex items-center gap-1 transition-colors border border-transparent hover:border-indigo-100"
                          title="Copy Booking Link"
                        >
                          {copiedSlug === team.slug ? (
                            <><Check className="w-4 h-4 text-emerald-500" /> <span className="text-xs font-medium text-emerald-600">Copied</span></>
                          ) : (
                            <><Copy className="w-4 h-4" /> <span className="text-xs font-medium">Link</span></>
                          )}
                        </button>
                        <button
                          onClick={() => startEditing(team)}
                          className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 p-1.5 rounded inline-flex items-center gap-1 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" /> Edit
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" /> New Team
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              {createError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-red-800">{createError}</p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
                <input
                  required
                  type="text"
                  value={newName}
                  onChange={handleNameChange}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors shadow-sm text-sm text-gray-900 placeholder-gray-400"
                  placeholder="e.g. Sales"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug</label>
                <div className="flex items-center">
                  <span className="px-3 py-2 border border-r-0 border-gray-300 rounded-l-lg bg-gray-50 text-gray-500 text-sm">
                    tenant.com/
                  </span>
                  <input
                    required
                    type="text"
                    value={newSlug}
                    onChange={(e) => {
                      setSlugEdited(true);
                      setNewSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '')
                          .replace(/-+/g, '-')
                      );
                    }}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-r-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 font-mono text-sm transition-colors shadow-sm text-gray-900 placeholder-gray-400"
                    placeholder="sales"
                  />
                </div>
              </div>
              
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isCreating || !newName || !newSlug}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                >
                  {isCreating ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
