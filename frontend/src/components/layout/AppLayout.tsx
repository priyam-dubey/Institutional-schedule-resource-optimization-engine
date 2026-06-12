import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, Building2, DoorOpen, BookOpen, Users,
  CalendarDays, FileText, Upload, Activity, LogOut, Bell, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../../lib/authStore';
import { clsx } from 'clsx';
import { RoleBadge } from '../ui';

const NAV_ITEMS = [
  { section: 'Overview',
    items: [
      { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',   live: true },
      { to: '/health',       icon: Activity,        label: 'System Health' },
    ]
  },
  { section: 'Academic Data',
    items: [
      { to: '/departments', icon: Building2,   label: 'Departments' },
      { to: '/rooms',       icon: DoorOpen,    label: 'Rooms' },
      { to: '/courses',     icon: BookOpen,    label: 'Courses' },
      { to: '/faculty',     icon: Users,       label: 'Faculty & Users', badge: 0 },
    ]
  },
  { section: 'Operations',
    items: [
      { to: '/timetable',     icon: CalendarDays, label: 'Timetable' },
      { to: '/pdf-ingestion', icon: FileText,     label: 'PDF Ingestion' },
      { to: '/bulk-import',   icon: Upload,       label: 'Bulk Import' },
    ]
  },
];

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [corrId] = useState(() => Math.random().toString(36).substr(2, 8));

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const initials = user?.name.split(' ').map(w => w[0]).slice(-2).join('') ?? 'U';

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col bg-white border-r border-surface-border">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-gradient flex items-center justify-center text-white font-bold text-sm flex-shrink-0">S</div>
            <div>
              <div className="text-[13px] font-bold text-slate-800 leading-tight">Samayak</div>
              <div className="text-[10px] text-slate-400 leading-tight">Admin Panel</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {NAV_ITEMS.map(section => (
            <div key={section.section}>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-1.5">
                {section.section}
              </div>
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => clsx(
                      'sidebar-link',
                      isActive && 'active'
                    )}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.live && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-px">{item.badge}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-surface-border">
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-muted">
            <div className="w-7 h-7 rounded-full bg-brand-gradient flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-slate-700 truncate">{user?.name ?? 'User'}</div>
              <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
            </div>
            <button onClick={handleLogout} title="Sign out"
              className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
          {user?.role && (
            <div className="mt-2 px-1">
              <RoleBadge role={user.role as any} />
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 flex-shrink-0 bg-white border-b border-surface-border px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
              X-Corr: {corrId}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </div>
            <button className="w-8 h-8 flex items-center justify-center rounded-xl border border-surface-border hover:bg-slate-50 transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4 text-slate-500" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-xl border border-surface-border hover:bg-slate-50 transition-colors" title="Notifications">
              <Bell className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
