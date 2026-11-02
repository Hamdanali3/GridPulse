import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { Activity, Bell, ClipboardList, Cpu, FileBarChart, LogOut, MapPinned, Settings, ShieldCheck, Users } from 'lucide-react';
import Logo from '../components/Logo';
import AppFooter from '../components/AppFooter';
import UserMenu from '../components/UserMenu';
import ChatDock from '../components/chat/ChatDock';
import ErrorBoundary from '../components/ErrorBoundary';
import { useAuth } from '../lib/auth';
import { clearSessionMessages } from '../lib/assistant';
import { get, getPaged } from '../lib/api';
import type { Alert, FleetLive } from '../lib/types';
import { useZonedClock } from '../lib/hooks';
import { fmtAgo, fmtKw } from '../lib/format';
import { ThemeToggle } from '../lib/theme';

const nav = [
  { to: '/', label: 'Overview', icon: Activity, end: true },
  { to: '/sites', label: 'Sites', icon: MapPinned },
  { to: '/assets', label: 'Assets', icon: Cpu },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/work-orders', label: 'Work orders', icon: ClipboardList },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
];

const sections: Record<string, { title: string; blurb: string }> = {
  '/': { title: 'Overview', blurb: "Fleet output, open alerts and today's energy across Chitral" },
  '/sites': { title: 'Sites', blurb: 'Eleven plants across Upper and Lower Chitral' },
  '/assets': { title: 'Assets', blurb: 'Turbines, inverters and units, plant by plant' },
  '/alerts': { title: 'Alerts', blurb: 'Rules fired on live telemetry, newest first' },
  '/work-orders': { title: 'Work orders', blurb: 'Maintenance from planned to done' },
  '/reports': { title: 'Reports', blurb: 'Energy and availability, by day and by plant' },
  '/team': { title: 'Team', blurb: 'Accounts and what each role may do' },
  '/audit': { title: 'Audit log', blurb: 'Who changed what, and when' },
  '/settings': { title: 'Settings', blurb: 'Your profile and password' },
};

export default function AppLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const clock = useZonedClock('Asia/Karachi');

  const openAlerts = useQuery({
    queryKey: ['alerts', 'open-count'],
    queryFn: () => getPaged<Alert>('/alerts', { status: 'open', limit: 1 }),
    refetchInterval: 15_000,
    select: (r) => r.meta.total,
  });
  const live = useQuery({ queryKey: ['fleet', 'live'], queryFn: () => get<FleetLive>('/telemetry/fleet/live'), refetchInterval: 5000 });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const items = [...nav, ...(can('admin') ? [{ to: '/team', label: 'Team', icon: Users }, { to: '/audit', label: 'Audit log', icon: ShieldCheck }] : [])];
  const section = '/' + (location.pathname.split('/')[1] ?? '');
  const meta = sections[section] ?? { title: 'GridPulse', blurb: 'Chitral district fleet' };
  const stale = live.data?.recorded_at ? Date.now() - new Date(live.data.recorded_at).getTime() > 60_000 : true;

  return (
    <div className="flex h-screen h-dvh overflow-hidden bg-mist">
      {/* Minimalist neutral sidebar rail */}
      <aside className="hidden h-full min-h-0 w-[220px] shrink-0 flex-col border-r border-line bg-paper md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={22} />
            <span className="text-[15px] font-semibold tracking-tight text-pine">GridPulse</span>
          </Link>
        </div>

        <nav className="flex flex-1 min-h-0 flex-col gap-0.5 overflow-y-auto px-2.5 py-3" aria-label="Primary">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13.5px] transition-colors',
                  isActive ? 'bg-moss font-medium text-pine' : 'text-ink-muted hover:bg-moss/60 hover:text-pine',
                )
              }
            >
              <item.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.6} />
              <span className="flex-1">{item.label}</span>
              {item.to === '/alerts' && !!openAlerts.data && (
                <span className="tabular rounded-chip border border-line bg-mist px-1.5 text-[11px] font-medium leading-[16px] text-pine">{openAlerts.data}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Quiet live telemetry readout */}
        <div className="mx-2.5 mb-2.5 shrink-0 rounded-control border border-line bg-mist px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <span className={clsx('h-1.5 w-1.5 rounded-full', stale ? 'bg-ember' : 'bg-amber')} />
            <span>{stale ? 'Idle' : 'Live'}</span>
            {live.data?.recorded_at && <span className="ml-auto tabular">{fmtAgo(live.data.recorded_at)}</span>}
          </div>
          <p className="mt-1 text-[19px] font-semibold leading-none tracking-[-0.02em] text-pine tabular">{fmtKw(live.data?.fleet_kw ?? 0)}</p>
          <p className="mt-1 text-[11px] text-ink-faint">{live.data?.reporting_assets ?? 0} assets reporting</p>
        </div>

        <div className="shrink-0 border-t border-line px-2.5 py-2.5">
          <NavLink to="/settings" className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13.5px] transition-colors', isActive ? 'bg-moss font-medium text-pine' : 'text-ink-muted hover:bg-moss/60 hover:text-pine')}>
            <Settings className="h-[15px] w-[15px]" strokeWidth={1.6} />
            Settings
          </NavLink>
          <button onClick={handleLogout} className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-[13.5px] text-ink-muted transition-colors hover:bg-moss/60 hover:text-pine">
            <LogOut className="h-[15px] w-[15px]" strokeWidth={1.6} />
            Log out
          </button>
          <div className="mt-2 flex items-center gap-2.5 border-t border-line px-2.5 pt-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-line-strong bg-moss text-[12px] font-semibold text-pine">
              {user?.name?.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-pine">{user?.name}</p>
              <p className="truncate text-[11px] capitalize text-ink-faint">{user?.role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Scrolling content column */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-30 border-b border-line bg-mist">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-8">
            <Link to="/" className="inline-flex items-center gap-2 md:hidden">
              <Logo size={22} />
              <span className="text-[15px] font-semibold text-pine">GridPulse</span>
            </Link>
            <div className="hidden min-w-0 items-baseline gap-3 md:flex">
              <p className="truncate text-[15px] font-semibold text-pine">{meta.title}</p>
              <span className="hidden truncate text-[12.5px] text-ink-faint xl:inline">{meta.blurb}</span>
            </div>
            <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
              <span className="hidden items-center gap-1.5 pr-1 lg:inline-flex" title="Chitral local time">
                <span className="tabular font-medium text-pine">{clock.time}</span>
                <span className="text-ink-faint">· {clock.date}, Chitral</span>
              </span>
              <ThemeToggle />
              <NavLink
                to="/alerts"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-control border border-line bg-paper text-ink-muted transition-colors hover:border-line-strong hover:bg-moss hover:text-pine"
                aria-label={openAlerts.data ? `${openAlerts.data} open alerts` : 'Alerts'}
              >
                <Bell className="h-[15px] w-[15px]" strokeWidth={1.6} />
                {!!openAlerts.data && (
                  <span className="tabular absolute -right-1 -top-1 min-w-[16px] rounded-chip bg-[#c63b25] px-1 text-center text-[10px] font-medium leading-[16px] text-white">
                    {openAlerts.data}
                  </span>
                )}
              </NavLink>
              <UserMenu user={user} onLogout={handleLogout} />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 pb-12 pt-6 md:px-8 md:pb-16 md:pt-8" key={location.pathname}>
          <Outlet />
        </main>
        <AppFooter lastReadingAt={live.data?.recorded_at} />
      </div>

      {/* Session AI Copilot Dock */}
      <ErrorBoundary onReset={() => { if (user) clearSessionMessages(user.id); }}>
        <ChatDock />
      </ErrorBoundary>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-paper px-1 pb-[env(safe-area-inset-bottom,0px)] md:hidden" aria-label="Primary">
        {nav.slice(0, 5).map((item) => (
          <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 px-2 py-2 text-[11px]', isActive ? 'font-medium text-pine' : 'text-ink-faint')}>
            <item.icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export { default as Logo } from '../components/Logo';
