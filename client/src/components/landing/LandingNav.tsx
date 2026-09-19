import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Logo from '../Logo';

const links = [
  { href: '#about', label: 'About' },
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#contact', label: 'Contact' },
];

/** Sticky top nav for the public landing page. Collapses to a mobile menu below md. */
export default function LandingNav() {
  const [open, setOpen] = useState(false);

  // Close the mobile menu on Escape, or if the viewport grows past the mobile breakpoint.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const mq = window.matchMedia('(min-width: 768px)');
    const onResize = () => {
      if (mq.matches) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onResize);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-mist/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-display text-[17px] font-semibold tracking-tight text-pine">GridPulse</span>
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Section">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[14px] text-ink-muted transition-colors hover:text-pine">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <Link to="/register" className="btn btn-primary">Get started</Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-line bg-paper text-pine md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
        </button>
      </div>

      {open && (
        <nav id="landing-mobile-menu" aria-label="Section" className="border-t border-line bg-paper px-4 pb-4 pt-2 md:hidden">
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block rounded-control px-2 py-2.5 text-[15px] text-ink transition-colors hover:bg-moss">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2">
            <Link to="/login" onClick={() => setOpen(false)} className="btn btn-secondary w-full">Log in</Link>
            <Link to="/register" onClick={() => setOpen(false)} className="btn btn-primary w-full">Get started</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
