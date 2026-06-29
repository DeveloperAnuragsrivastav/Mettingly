import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import AuthCallback from './pages/AuthCallback'
import ProtectedRoute from './components/ProtectedRoute'
import PlatformDashboard from './pages/platform/PlatformDashboard'
import DashboardShell from './components/dashboard/DashboardShell'
import TeamsPage from './pages/dashboard/TeamsPage'
import MembersPage from './pages/dashboard/MembersPage'
import SetPasswordPage from './pages/SetPasswordPage'
import ChangePasswordPage from './pages/dashboard/ChangePasswordPage'
import AvailabilityPage from './pages/dashboard/AvailabilityPage'
import TeamAvailabilityPage from './pages/dashboard/TeamAvailabilityPage'
import InsightsPage from './pages/dashboard/InsightsPage'
import AuditLogPage from './pages/dashboard/AuditLogPage'
import TemporaryPagesPage from './pages/dashboard/TemporaryPagesPage'
import CalendarConnectPage from './pages/dashboard/CalendarConnectPage'
import BookingPage from './pages/public/BookingPage'
import CampaignBookingPage from './pages/public/CampaignBookingPage'
import BookingConfirmation from './pages/public/BookingConfirmation'
import ManageBookingPage from './pages/public/ManageBookingPage'
import MyBookingsPage from './pages/dashboard/MyBookingsPage'

function UnauthorizedPage() {
  const { signOut } = useAuth()
  
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Not Linked</h1>
        <p className="text-gray-600 mb-6">
          Your account isn't linked to any organization yet. Please contact your administrator to be invited to a workspace.
        </p>
        <button
          onClick={signOut}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

// Role-based protection within the tenant dashboard
function RoleRoute({ allowedRoles, children }) {
  const { identity } = useAuth()
  const role = identity?.data?.role
  
  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }
  
  return children
}

// Default redirect for /dashboard based on role
function DashboardIndex() {
  const { identity } = useAuth()
  const role = identity?.data?.role
  
  if (role === 'super_admin') return <Navigate to="/dashboard/teams" replace />
  if (role === 'team_admin') return <Navigate to="/dashboard/my-team" replace />
  return <Navigate to="/dashboard/bookings" replace />
}

function PlaceholderPage({ title }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <p className="text-gray-500">Coming soon.</p>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            borderRadius: '8px',
            background: '#333',
            color: '#fff',
          },
          success: {
            style: {
              background: '#059669', // green-600
            },
          },
          error: {
            style: {
              background: '#dc2626', // red-600
            },
          },
        }}
      />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/book/:teamSlug" element={<BookingPage />} />
          <Route path="/campaign/:campaignSlug" element={<CampaignBookingPage />} />
          <Route path="/booking-confirmation" element={<BookingConfirmation />} />
          <Route path="/manage/:token" element={<ManageBookingPage />} />
          
          <Route 
            path="/platform/*" 
            element={
              <ProtectedRoute allowedTypes={['platform_admin']}>
                <PlatformDashboard />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute allowedTypes={['member']}>
                <DashboardShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardIndex />} />
            <Route path="change-password" element={<ChangePasswordPage />} />
            
            {/* Super Admin Routes */}
            <Route 
              path="teams" 
              element={
                <RoleRoute allowedRoles={['super_admin']}>
                  <TeamsPage />
                </RoleRoute>
              } 
            />
            <Route 
              path="members" 
              element={
                <RoleRoute allowedRoles={['super_admin']}>
                  <MembersPage />
                </RoleRoute>
              } 
            />
            {/* Team Admin Routes */}
            <Route 
              path="my-team" 
              element={
                <RoleRoute allowedRoles={['team_admin']}>
                  <MembersPage />
                </RoleRoute>
              } 
            />
            {/* Shared Admin Routes */}
            <Route 
              path="team-availability" 
              element={
                <RoleRoute allowedRoles={['super_admin', 'team_admin']}>
                  <TeamAvailabilityPage />
                </RoleRoute>
              } 
            />
            <Route 
              path="insights" 
              element={
                <RoleRoute allowedRoles={['super_admin', 'team_admin']}>
                  <InsightsPage />
                </RoleRoute>
              } 
            />
            <Route 
              path="audit" 
              element={
                <RoleRoute allowedRoles={['super_admin', 'team_admin']}>
                  <AuditLogPage />
                </RoleRoute>
              } 
            />
            <Route 
              path="campaigns" 
              element={
                <RoleRoute allowedRoles={['super_admin', 'team_admin']}>
                  <TemporaryPagesPage />
                </RoleRoute>
              } 
            />

            {/* Member Routes */}
            <Route path="bookings" element={<MyBookingsPage />} />
            <Route path="availability" element={<AvailabilityPage />} />
            <Route path="calendar" element={<CalendarConnectPage />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
