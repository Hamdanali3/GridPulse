import { Link } from 'react-router-dom';
import { Github } from 'lucide-react';
import Logo from '../Logo';

const sitemap = [
  { href: '#about', label: 'About' },
  { href: '#features', label: 'Features' },
  { href: '#contact', label: 'Contact' },
];

/**
 * Footer for the public landing page only. Renders as the natural last element of the
 * page's own document flow — never fixed, never inside the authenticated app shell.
 * Do not confuse with AppFooter, which shows live API/telemetry health inside AppLayout.
 */
export default function LandingFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-[36ch]">
            <div className="flex items-center gap-2.5">
              <Logo size={24} />
              <span className="font-display text-[16px] font-semibold text-pine">GridPulse</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
              Renewable fleet operations for Chitral district — hydro, solar and wind, watched from one screen.
            </p>
          </div>

          <nav aria-label="Footer">
            <p className="text-[13px] font-medium text-pine">Sitemap</p>
            <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px]">
              {sitemap.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-ink-muted transition-colors hover:text-pine">{l.label}</a>
                </li>
              ))}
              <li><Link to="/login" className="text-ink-muted transition-colors hover:text-pine">Log in</Link></li>
              <li><Link to="/register" className="text-ink-muted transition-colors hover:text-pine">Get started</Link></li>
            </ul>
          </nav>

          <div>
            <p className="text-[13px] font-medium text-pine">Source</p>
            <a
              href="https://github.com/Hamdanali3/GridPulse"
              target="_blank"
              rel="noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-pine"
            >
              <Github className="h-4 w-4" strokeWidth={1.75} /> GitHub
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-line pt-4 text-[12.5px] text-ink-faint">
          <p>© 2026 GridPulse. Built by Hamdan Ali, Week 8 capstone.</p>
        </div>
      </div>
    </footer>
  );
}
