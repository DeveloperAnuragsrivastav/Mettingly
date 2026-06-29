import React, { useState, useEffect } from 'react';
import { platformApi } from '../../api/platform';
import { useAuth } from '../../context/AuthContext';
import CreateOrganizationModal from './CreateOrganizationModal';
import { format } from 'date-fns';
import { LogOut, Building, Plus, Activity, PowerOff, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/common/ConfirmDialog';

export default function PlatformDashboard() {
  const { signOut } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState(null);
  const [confirmOrg, setConfirmOrg] = useState({ isOpen: false, org: null });

  const fetchOrganizations = async () => {
    setIsLoading(true);
    try {
      const data = await platformApi.listOrganizations();
      setOrganizations(data);
    } catch (err) {
      setError('Failed to load organizations.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const handleToggleActive = (org) => {
    if (org.is_active) {
      setConfirmOrg({ isOpen: true, org });
    } else {
      executeToggleActive(org);
    }
  };

  const executeToggleActive = async (org) => {
    try {
      await platformApi.updateOrganization(org.id, { is_active: !org.is_active });
      setConfirmOrg({ isOpen: false, org: null });
      fetchOrganizations();
      toast.success(`Organization ${org.is_active ? 'deactivated' : 'activated'} successfully.`);
    } catch (err) {
      toast.error('Failed to update organization status.');
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Top Navbar */}
      <nav className="bg-indigo-900 text-white shadow-md border-b border-indigo-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-indigo-400" />
              <h1 className="text-xl font-bold tracking-tight">Platform Console</h1>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-100 hover:text-white hover:bg-indigo-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <ConfirmDialog
        isOpen={confirmOrg.isOpen}
        title="Deactivate Organization"
        message={`Are you sure you want to deactivate ${confirmOrg.org?.name}? This will block all their users and customers from accessing the platform.`}
        confirmText="Deactivate"
        onConfirm={() => executeToggleActive(confirmOrg.org)}
        onCancel={() => setConfirmOrg({ isOpen: false, org: null })}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building className="w-6 h-6 text-gray-400" />
              Organizations
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage all tenant organizations on the platform.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <Plus className="w-4 h-4" />
            New Organization
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Organizations Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Organization
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    URL Slug
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
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
                    <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                      <Activity className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                      Loading organizations...
                    </td>
                  </tr>
                ) : organizations.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                      No organizations found. Get started by creating one.
                    </td>
                  </tr>
                ) : (
                  organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">{org.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded inline-block font-mono">
                          /{org.slug}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            org.is_active
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          {org.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(org.created_at), 'd MMMM yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleToggleActive(org)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                            org.is_active
                              ? 'bg-white text-red-700 border-red-200 hover:bg-red-50 hover:border-red-300'
                              : 'bg-white text-green-700 border-green-200 hover:bg-green-50 hover:border-green-300'
                          }`}
                        >
                          <PowerOff className="w-3.5 h-3.5" />
                          {org.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <CreateOrganizationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={fetchOrganizations}
      />
    </div>
  );
}
