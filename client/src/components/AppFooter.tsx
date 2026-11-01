import { Link } from 'react-router-dom';
import Logo from './Logo';

const links = [
  { to: '/', label: 'Overview' },
  { to: '/sites', label: 'Sites' },
  { to: '/assets', label: 'Assets' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/work-orders', label: 'Work orders' },
  { to: '/reports', label: 'Reports' },
];

export default function AppFooter(_props: { lastReadingAt?: string | null }) {
  return (
    <footer className="mt-auto border-t border-line bg-mist pb-[calc(env(safe-area-inset-bottom,0px)+64px)] md:pb-0">
      <div className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link to="/" className="inline-flex items-center gap-2">
            <Logo size={20} />
            <span className="text-[14px] font-semibold text-pine">GridPulse</span>
          </Link>
          <p className="text-[12px] text-ink-faint">© 2026 GridPulse</p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
            {links.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-ink-muted transition-colors hover:text-pine">{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
