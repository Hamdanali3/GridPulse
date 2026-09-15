import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { Activity, Bell, ClipboardList, Cpu, FileBarChart, LogOut, MapPinned, Moon, Settings, ShieldCheck, Sun, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { get, getPaged } from '../lib/api';
import type { Alert, FleetLive } from '../lib/types';
import { useZonedClock } from '../lib/hooks';
import { fmtAgo, fmtKw } from '../lib/format';

const nav = [
  { to: '/', label: 'Overview', icon: Activity, end: true },
  { to: '/sites', label: 'Sites', icon: MapPinned },
  { to: '/assets', label: 'Assets', icon: Cpu },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/work-orders', label: 'Work orders', icon: ClipboardList },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
];

const titles: Record<string, string> = {
  '/': 'Overview', '/sites': 'Sites', '/assets': 'Assets', '/alerts': 'Alerts', '/work-orders': 'Work orders',
  '/reports': 'Reports', '/team': 'Team', '/audit': 'Audit log', '/settings': 'Settings',
};

export default function AppLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const clock = useZonedClock('Asia/Karachi');
  const daylight = clock.hour >= 6 && clock.hour < 19;

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
  const title = titles[section] ?? 'GridPulse';
  const stale = live.data?.recorded_at ? Date.now() - new Date(live.data.recorded_at).getTime() > 60_000 : true;

  return (
    <div className="flex min-h-full">
      {/* Rail */}
      <aside className="hidden w-[232px] shrink-0 flex-col bg-pine text-white md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
          <Logo />
          <div className="leading-tight">
            <span className="block font-display text-[18px] font-semibold tracking-tight">GridPulse</span>
            <span className="block text-[11.5px] text-white/55">Chitral operations · چترال</span>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Primary">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-control px-3 py-2.5 text-[14px] transition-colors',
                  isActive ? 'bg-white/10 font-medium text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.to === '/alerts' && !!openAlerts.data && (
                <span className="tabular rounded-chip bg-ember px-1.5 text-[11.5px] font-semibold leading-[18px] text-white">{openAlerts.data}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Fleet pulse in the rail: always visible, whatever page you are on */}
        <div className="mx-3 mb-3 rounded-control border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11.5px] text-white/60">
            <span className={clsx('h-1.5 w-1.5 rounded-full', stale ? 'bg-ember' : 'bg-amber')} />
            {stale ? 'Simulator idle' : 'Live'}
            {live.data?.recorded_at && <span className="ml-auto">{fmtAgo(live.data.recorded_at)}</span>}
          </div>
          <p className="mt-1 font-display text-[22px] font-semibold leading-none text-amber tabular">{fmtKw(live.data?.fleet_kw ?? 0)}</p>
          <p className="mt-0.5 text-[11.5px] text-white/50">{live.data?.reporting_assets ?? 0} assets reporting</p>
        </div>

        <div className="border-t border-white/10 px-3 py-3">
          <NavLink to="/settings" className={({ isActive }) => clsx('flex items-center gap-3 rounded-control px-3 py-2.5 text-[14px] transition-colors', isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white')}>
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Settings
          </NavLink>
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-[14px] text-white/70 transition-colors hover:bg-white/5 hover:text-white">
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Log out
          </button>
          <div className="mt-2 flex items-center gap-3 px-3 pt-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber font-display text-[13px] font-semibold text-pine">
              {user?.name?.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium">{user?.name}</p>
              <p className="truncate text-[12px] capitalize text-white/60">{user?.role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-mist/85 px-4 py-2.5 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <Logo size={24} />
            <span className="font-display text-[16px] font-semibold text-pine">GridPulse</span>
          </div>
          <p className="hidden text-[13.5px] text-ink-muted md:block">
            <span className="font-medium text-pine">{title}</span>
            <span className="mx-2 text-ink-faint">/</span>Chitral district fleet
          </p>
          <div className="flex items-center gap-3 text-[13px] text-ink-muted">
            <span className="hidden items-center gap-1.5 sm:inline-flex" title="Chitral local time">
              {daylight ? <Sun className="h-3.5 w-3.5 text-amber" /> : <Moon className="h-3.5 w-3.5 text-teal" />}
              <span className="tabular font-medium text-pine">{clock.time}</span>
              <span>{clock.date} · Chitral</span>
            </span>
            <button onClick={handleLogout} className="btn btn-ghost btn-sm md:hidden">Log out</button>
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-6" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-paper px-1 pb-[env(safe-area-inset-bottom,0px)] md:hidden" aria-label="Primary">
        {nav.slice(0, 5).map((item) => (
          <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 px-2 py-2 text-[11px]', isActive ? 'text-pine' : 'text-ink-faint')}>
            <item.icon className="h-5 w-5" strokeWidth={1.75} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#F2A93B" />
      <path d="M6 21 L11 13 L15 18 L20 9 L26 19" fill="none" stroke="#14312B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="19" r="2.4" fill="#14312B" />
    </svg>
  );
}
