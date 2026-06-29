import React, { useState, useEffect } from 'react';
import { membersApi } from '../../api/members';
import { teamsApi } from '../../api/teams';
import { useAuth } from '../../context/AuthContext';
import { Plus, Trash2, Edit, AlertCircle, Shield, CheckCircle2, UserPlus, X, Copy, Check, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

export default function MembersPage() {
  const { identity } = useAuth();
  const currentRole = identity?.data?.role;
  const currentTeamId = identity?.data?.team_id;
  const teamSlug = identity?.data?.team_slug;
  const isSuperAdmin = currentRole === 'super_admin';
  const isTeamAdmin = currentRole === 'team_admin';

  const [copiedLink, setCopiedLink] = useState(false);
  const FRONTEND_URL = window.location.origin;
  
  const handleCopyLink = () => {
    if (teamSlug) {
      navigator.clipboard.writeText(`${FRONTEND_URL}/book/${teamSlug}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState(null);
  
  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [teamId, setTeamId] = useState(isTeamAdmin ? currentTeamId : '');
  const [role, setRole] = useState(isTeamAdmin ? 'member' : 'member');
  
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, type: null, memberId: null, memberName: null });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [membersData, teamsData] = await Promise.all([
        membersApi.listMembers(),
        isSuperAdmin ? teamsApi.listTeams() : Promise.resolve([])
      ]);
      setMembers(membersData);
      if (isSuperAdmin) {
        setTeams(teamsData);
      }
    } catch (err) {
      setError('Failed to load members data.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setIsInviting(true);
    setInviteError(null);
    setInviteSuccessMsg(null);
    try {
      const payload = {
        full_name: fullName,
        email: email,
        role: isTeamAdmin ? 'member' : role,
        team_id: isTeamAdmin ? currentTeamId : (teamId || null)
      };
      await membersApi.inviteMember(payload);
      setInviteSuccessMsg(`Invited — they'll gain access once they sign up with ${email}`);
      setFullName('');
      setEmail('');
      if (isSuperAdmin) {
        setTeamId('');
        setRole('member');
      }
      fetchData();
    } catch (err) {
      setInviteError(err.response?.data?.detail || 'Failed to invite member.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleConfirmAction = async () => {
    const { type, memberId } = confirmDialog;
    setConfirmDialog({ isOpen: false, type: null, memberId: null, memberName: null });
    
    if (type === 'delete') {
      try {
        await membersApi.deleteMember(memberId);
        toast.success('Member removed successfully.');
        fetchData();
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to remove member.');
      }
    } else if (type === 'promote') {
      try {
        await membersApi.updateMemberRole(memberId, 'team_admin');
        toast.success('Member promoted successfully.');
        fetchData();
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to promote member.');
      }
    } else if (type === 'demote') {
      try {
        await membersApi.updateMemberRole(memberId, 'member');
        toast.success('Member demoted successfully.');
        fetchData();
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to demote member.');
      }
    }
  };

  const handleToggleActive = async (memberId, currentStatus, memberName) => {
    const newStatus = !currentStatus;
    try {
      await membersApi.toggleMemberActive(memberId, newStatus);
      // Optimistic update
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_active_for_booking: newStatus } : m));
      // Show toast-like feedback
      toast.success(newStatus ? `Added ${memberName} back to booking rotation` : `Removed ${memberName} from booking rotation`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to toggle active status.');
    }
  };

  const closeInviteModal = () => {
    setIsModalOpen(false);
    setInviteError(null);
    setInviteSuccessMsg(null);
    setFullName('');
    setEmail('');
  };

  return (
    <div>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={
          confirmDialog.type === 'delete' ? 'Remove Member' :
          confirmDialog.type === 'promote' ? 'Promote Member' :
          'Demote Member'
        }
        message={
          confirmDialog.type === 'delete' ? `Are you sure you want to remove ${confirmDialog.memberName}?` :
          confirmDialog.type === 'promote' ? `Promote ${confirmDialog.memberName} to Team Admin? This member will be able to manage their team's members and availability settings.` :
          `Demote ${confirmDialog.memberName} to regular member?`
        }
        confirmText={confirmDialog.type === 'delete' ? 'Remove' : confirmDialog.type === 'promote' ? 'Promote' : 'Demote'}
        isDestructive={confirmDialog.type === 'delete'}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmDialog({ isOpen: false, type: null, memberId: null, memberName: null })}
      />
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isSuperAdmin ? 'Organization Members' : 'My Team Members'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {isSuperAdmin 
              ? 'Manage all members across all teams.' 
              : 'Manage members within your team.'}
          </p>
          {isTeamAdmin && teamSlug && (
            <div className="mt-3 flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 rounded-lg px-3 py-2 w-fit">
              <Link2 className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-medium text-indigo-900">Your Team Link:</span>
              <span className="text-sm text-indigo-600 font-mono select-all">/book/{teamSlug}</span>
              <button
                onClick={handleCopyLink}
                className="ml-2 p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors"
                title="Copy booking link"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <UserPlus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Team</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Booking Active</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">Loading members...</td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No members found.</td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{m.full_name}</div>
                      <div className="text-sm text-gray-500">{m.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md font-medium">
                        {m.team_name || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        m.role === 'super_admin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        m.role === 'team_admin' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-gray-50 text-gray-700 border-gray-200'
                      }`}>
                        {m.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        m.onboarding_status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${m.onboarding_status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {m.onboarding_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleToggleActive(m.id, m.is_active_for_booking, m.full_name)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                          m.is_active_for_booking ? 'bg-indigo-600' : 'bg-gray-200'
                        }`}
                        role="switch"
                        aria-checked={m.is_active_for_booking}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            m.is_active_for_booking ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-3">
                        {isSuperAdmin && m.role === 'member' && m.team_id && (
                          <button
                            onClick={() => setConfirmDialog({ isOpen: true, type: 'promote', memberId: m.id, memberName: m.full_name })}
                            className="text-xs text-indigo-600 hover:text-indigo-900 font-medium transition-colors"
                          >
                            Promote
                          </button>
                        )}
                        {isSuperAdmin && m.role === 'team_admin' && (
                          <button
                            onClick={() => setConfirmDialog({ isOpen: true, type: 'demote', memberId: m.id, memberName: m.full_name })}
                            className="text-xs text-gray-600 hover:text-gray-900 font-medium transition-colors"
                          >
                            Demote
                          </button>
                        )}
                        {m.id !== identity.data.id && ( // Prevent self-delete
                          <button
                            onClick={() => setConfirmDialog({ isOpen: true, type: 'delete', memberId: m.id, memberName: m.full_name })}
                            className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded transition-colors"
                            title="Remove Member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" /> Invite Member
              </h3>
              <button 
                onClick={closeInviteModal} 
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              {inviteSuccessMsg ? (
                <div className="text-center py-4">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 mb-4">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <p className="text-sm font-medium text-emerald-800 bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                    {inviteSuccessMsg}
                  </p>
                  <button
                    onClick={closeInviteModal}
                    className="mt-6 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleInvite} className="space-y-4">
                  {inviteError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-red-800">{inviteError}</p>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input
                      required
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors shadow-sm text-sm text-gray-900 placeholder-gray-400"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors shadow-sm text-sm text-gray-900 placeholder-gray-400"
                      placeholder="john@example.com"
                    />
                  </div>

                  {isSuperAdmin && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Team (Optional)</label>
                        <select
                          value={teamId}
                          onChange={(e) => setTeamId(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 bg-white transition-colors shadow-sm text-sm text-gray-900"
                        >
                          <option value="">No Team (Org Level)</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                        <select
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 bg-white transition-colors shadow-sm text-sm text-gray-900"
                        >
                          <option value="member">Member</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Note: Team Admins must be promoted from existing members via the table actions.
                        </p>
                      </div>
                    </>
                  )}
                  
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isInviting || !fullName || !email || (isSuperAdmin && role !== 'super_admin' && !teamId)}
                      className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                    >
                      {isInviting ? 'Inviting...' : 'Send Invite'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
