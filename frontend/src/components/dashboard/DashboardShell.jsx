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
    <div className="flex h-screen bg-background text-on-surface font-sans antialiased">
      {/* Sidebar */}
      <aside className="w-sidebar-width bg-surface-bright border-r border-outline-variant flex flex-col justify-between py-lg shrink-0">
        <div>
          <div className="px-lg mb-xl">
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight">Meeting SaaS</h1>
          </div>
          <nav className="flex flex-col gap-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 mx-2 rounded-xl font-label-md text-label-md transition-colors duration-200 ${
                      isActive
                        ? 'bg-primary-fixed text-on-primary-fixed-variant font-semibold'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    }`
                  }
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {item.name}
                </NavLink>
              );
            })}
          </nav>
        </div>
        
        {/* Sidebar Footer / User Profile */}
        <div className="border-t border-outline-variant pt-lg mx-md">
          <div className="flex items-center gap-3 mb-md px-2">
            <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center font-label-md text-label-md font-bold shrink-0">
              {fullName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-label-md text-label-md text-on-surface truncate">{fullName}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant capitalize">{role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-3 px-2 py-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-xl transition-colors font-label-md text-label-md"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-surface-bright border-b border-outline-variant flex items-center px-lg justify-end gap-lg shrink-0">
          <NavLink 
            to="/dashboard/change-password"
            className={({ isActive }) => 
              `hover:text-primary transition-colors font-label-md text-label-md ${isActive ? 'text-primary font-medium' : 'text-on-surface-variant'}`
            }
          >
            Change Password
          </NavLink>
          <div className="w-px h-4 bg-outline-variant" />
          <span className="text-on-surface-variant font-label-md text-label-md">Tenant Dashboard</span>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-lg">
          <div className="max-w-container-max mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
