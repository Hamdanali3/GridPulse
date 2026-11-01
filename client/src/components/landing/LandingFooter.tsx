import { Link } from 'react-router-dom';
import Logo from '../Logo';

const sitemap = [
  { href: '#about', label: 'About' },
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#contact', label: 'Contact' },
];

export default function LandingFooter() {
  return (
    <footer className="border-t border-line bg-mist">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-7 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link to="/" className="inline-flex items-center gap-2">
            <Logo size={20} />
            <span className="text-[14.5px] font-semibold text-pine">GridPulse</span>
          </Link>
          <p className="text-[12px] text-ink-faint">© 2026 GridPulse</p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[12.5px]">
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
