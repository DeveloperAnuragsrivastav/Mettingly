import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Users, LayoutDashboard, BarChart3, Shield, BookOpen, Calendar, Settings, LogOut, Link } from 'lucide-react';

export default function DashboardShell() {
  const { identity, signOut } = useAuth();
  
  const role = identity?.data?.role;
  const fullName = identity?.data?.full_name || 'User';

  const getNavItems = () => {
    const personalItems = [
      { name: 'My Bookings', path: '/dashboard/bookings', icon: BookOpen },
      { name: 'My Availability', path: '/dashboard/availability', icon: Settings },
      { name: 'Calendar', path: '/dashboard/calendar', icon: Calendar },
    ];

    switch (role) {
      case 'super_admin':
        return [
          { name: 'Teams', path: '/dashboard/teams', icon: Users },
          { name: 'Members', path: '/dashboard/members', icon: LayoutDashboard },
          { name: 'Team Availability', path: '/dashboard/team-availability', icon: Settings },
          { name: 'Insights', path: '/dashboard/insights', icon: BarChart3 },
          { name: 'Audit Log', path: '/dashboard/audit', icon: Shield },
          { name: 'Campaigns', path: '/dashboard/campaigns', icon: Link },
          ...personalItems
        ];
      case 'team_admin':
        return [
          { name: 'My Team', path: '/dashboard/my-team', icon: Users },
          { name: 'Team Availability', path: '/dashboard/team-availability', icon: Settings },
          { name: 'Insights', path: '/dashboard/insights', icon: BarChart3 },
          { name: 'Audit Log', path: '/dashboard/audit', icon: Shield },
          { name: 'Campaigns', path: '/dashboard/campaigns', icon: Link },
          ...personalItems
        ];
      case 'member':
      default:
        return personalItems;
    }
  };

  const navItems = getNavItems();

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Meeting SaaS</h1>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>
        
        {/* Sidebar Footer / User Profile */}
        <div className="p-4 border-t border-gray-200 bg-gray-50/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
              {fullName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{fullName}</p>
              <p className="text-xs text-gray-500 capitalize">{role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 justify-between shrink-0">
          <div className="flex-1" />
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <NavLink 
              to="/dashboard/change-password"
              className={({ isActive }) => 
                `hover:text-gray-900 transition-colors ${isActive ? 'text-indigo-600 font-medium' : ''}`
              }
            >
              Change Password
            </NavLink>
            <span className="text-gray-300">|</span>
            <span>Tenant Dashboard</span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
