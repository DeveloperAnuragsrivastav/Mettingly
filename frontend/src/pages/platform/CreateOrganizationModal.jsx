import React, { useState } from 'react';
import { X, Building2, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { platformApi } from '../../api/platform';

export default function CreateOrganizationModal({ isOpen, onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1: Create Org, 2: Bootstrap Super Admin, 3: Success
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1 State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [createdOrgId, setCreatedOrgId] = useState(null);

  // Step 2 State
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  if (!isOpen) return null;

  const handleNameChange = (e) => {
    const newName = e.target.value;
    setName(newName);
    if (!slugEdited) {
      setSlug(
        newName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
      );
    }
  };

  const handleSlugChange = (e) => {
    setSlugEdited(true);
    setSlug(
      e.target.value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
    );
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const org = await platformApi.createOrganization({ name, slug });
      setCreatedOrgId(org.id);
      setStep(2);
    } catch (err) {
      if (err.response?.status === 409) {
        setError('This slug is already taken. Please choose another.');
      } else {
        setError(err.response?.data?.detail || 'Failed to create organization');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBootstrapAdmin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await platformApi.bootstrapSuperAdmin(createdOrgId, {
        email: adminEmail,
        full_name: adminName
      });
      setStep(3);
    } catch (err) {
      if (err.response?.status === 409) {
        setError('A member with this email already exists in this organization.');
      } else {
        setError(err.response?.data?.detail || 'Failed to bootstrap super admin');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setName('');
    setSlug('');
    setSlugEdited(false);
    setAdminName('');
    setAdminEmail('');
    setError(null);
    setCreatedOrgId(null);
    if (step > 1) {
      onCreated();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            {step === 1 && <><Building2 className="w-5 h-5 text-indigo-600" /> Onboard Organization</>}
            {step === 2 && <><UserPlus className="w-5 h-5 text-indigo-600" /> Super Admin Setup</>}
            {step === 3 && <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Success</>}
          </h3>
          <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-100 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleCreateOrg} className="space-y-5">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                <input
                  id="name"
                  required
                  type="text"
                  value={name}
                  onChange={handleNameChange}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors shadow-sm text-sm text-gray-900 placeholder-gray-400"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">URL Slug</label>
                <div className="flex items-center">
                  <span className="px-3 py-2 border border-r-0 border-gray-300 rounded-l-lg bg-gray-50 text-gray-500 text-sm">
                    platform.com/
                  </span>
                  <input
                    id="slug"
                    required
                    type="text"
                    value={slug}
                    onChange={handleSlugChange}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-r-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors shadow-sm text-sm text-gray-900 placeholder-gray-400"
                    placeholder="acme-corp"
                  />
                </div>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !name || !slug}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                >
                  {isLoading ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleBootstrapAdmin} className="space-y-5">
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm mb-6 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
                <p><strong>{name} created!</strong> Now create this organization's first Super Admin.</p>
              </div>

              <div>
                <label htmlFor="adminName" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  id="adminName"
                  required
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors shadow-sm text-sm text-gray-900 placeholder-gray-400"
                  placeholder="e.g. Jane Doe"
                />
              </div>
              <div>
                <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  id="adminEmail"
                  required
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors shadow-sm text-sm text-gray-900 placeholder-gray-400"
                  placeholder="jane@example.com"
                />
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !adminName || !adminEmail}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                >
                  {isLoading ? 'Inviting...' : 'Bootstrap Super Admin'}
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="text-center py-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Onboarding Complete</h3>
              <p className="text-sm text-gray-500 mb-6">
                Super Admin invited. They will gain access once they sign up with <strong>{adminEmail}</strong>.
              </p>
              <button
                onClick={handleClose}
                className="w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2.5 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm transition-all"
              >
                Close & Return to Console
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
