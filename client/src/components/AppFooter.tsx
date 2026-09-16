import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { api } from '../lib/api';
import { fmtAgo } from '../lib/format';
import Logo from './Logo';

interface Health {
  status: 'ok' | 'degraded';
  db: string;
  driver: string;
  env: string;
  time: string;
}

const links = [
  { to: '/', label: 'Overview' },
  { to: '/sites', label: 'Sites' },
  { to: '/assets', label: 'Assets' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/work-orders', label: 'Work orders' },
  { to: '/reports', label: 'Reports' },
];

/**
 * Page footer for the signed-in app. Carries real operational state (API reachability, telemetry
 * cadence, last reading) rather than marketing copy, plus the site map and attribution.
 */
export default function AppFooter({ lastReadingAt }: { lastReadingAt?: string | null }) {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.get<Health>('/health')).data,
    refetchInterval: 60_000,
    retry: false,
  });
  const apiState = health.isError ? 'offline' : health.data ? (health.data.status === 'ok' ? 'online' : 'degraded') : 'checking';
  const dot = { online: 'bg-teal', degraded: 'bg-amber', offline: 'bg-ember', checking: 'bg-ink-faint' }[apiState];

  return (
    <footer className="mt-auto pb-[calc(env(safe-area-inset-bottom,0px)+68px)] md:pb-0">
      <div className="chitral-strip" aria-hidden />
      <div className="bg-paper/80 px-4 md:px-8">
        <div className="grid gap-8 py-8 md:grid-cols-[1.4fr_1fr_1.3fr] md:gap-12">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo size={24} />
              <span className="font-display text-[16px] font-semibold text-pine">GridPulse</span>
            </div>
            <p className="mt-3 max-w-[40ch] text-[13px] leading-relaxed text-ink-muted">
              Renewable operations for Chitral district, Khyber Pakhtunkhwa. Hydro, solar and wind plants from
              Golen Gol to Shandur, watched from one screen.
            </p>
          </div>

          <nav aria-label="Footer">
            <p className="text-[13px] font-medium text-pine">Go to</p>
            <ul className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
              {links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-ink-muted transition-colors hover:text-pine">{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 self-start text-[13px]">
            <dt className="text-ink-faint">API</dt>
            <dd className="flex items-center gap-2 text-ink">
              <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} />
              <span className="capitalize">{apiState}</span>
              {health.data && <span className="text-ink-faint">· {health.data.driver}, {health.data.env}</span>}
            </dd>
            <dt className="text-ink-faint">Telemetry</dt>
            <dd className="text-ink">
              Simulated, every 5 s
              {lastReadingAt && <span className="text-ink-faint"> · last reading {fmtAgo(lastReadingAt)}</span>}
            </dd>
            <dt className="text-ink-faint">Region</dt>
            <dd className="text-ink">Chitral · Asia/Karachi (PKT)</dd>
          </dl>
        </div>

        <div className="flex flex-col gap-2 border-t border-line py-4 text-[12.5px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 GridPulse. Built by Muhammad Zafar, Week 8 capstone.</p>
          <p className="flex items-center gap-4">
            <a href="https://github.com/Hamdanali3/GridPulse" target="_blank" rel="noreferrer" className="transition-colors hover:text-pine">Source on GitHub</a>
            <span className="tabular">v{__APP_VERSION__}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
