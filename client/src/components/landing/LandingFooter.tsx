import { Link } from 'react-router-dom';
import Logo from '../Logo';

const sitemap = [
  { href: '#about', label: 'About' },
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#contact', label: 'Contact' },
];

/**
 * Footer for the public landing page only. Renders as the natural last element of the
 * page's own document flow — never fixed, never inside the authenticated app shell.
 */
export default function LandingFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <Logo size={24} />
            <span className="font-display text-[16px] font-semibold text-pine">GridPulse</span>
          </Link>
          <p className="text-[12.5px] text-ink-muted">© 2026 GridPulse</p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            {sitemap.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="text-ink-muted transition-colors hover:text-pine">{l.label}</a>
              </li>
            ))}
            <li><Link to="/login" className="text-ink-muted transition-colors hover:text-pine">Log in</Link></li>
            <li><Link to="/register" className="text-ink-muted transition-colors hover:text-pine">Get started</Link></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
