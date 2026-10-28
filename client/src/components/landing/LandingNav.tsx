import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { clsx } from 'clsx';
import Logo from '../Logo';
import { ThemeToggle } from '../../lib/theme';

interface NavLinkItem {
  label: string;
  href: string;
  route?: boolean;
}

interface MegaColumn {
  heading: string;
  items: NavLinkItem[];
}

interface MegaMenuSection {
  id: string;
  label: string;
  href: string;
  primary: MegaColumn;
  footerLinks: [NavLinkItem, NavLinkItem];
  secondary: MegaColumn[];
}

const MENUS: MegaMenuSection[] = [
  {
    id: 'about',
    label: 'About',
    href: '#about',
    primary: {
      heading: 'About',
      items: [
        { label: 'Our story', href: '#our-story' },
        { label: 'Team', href: '#team' },
        { label: 'Where we operate (Upper and Lower Chitral)', href: '#where-we-operate' },
      ],
    },
    footerLinks: [
      { label: 'Fleet numbers', href: '#where-we-operate' },
      { label: 'Try demo roles', href: '/login#demo-accounts', route: true },
    ],
    secondary: [
      {
        heading: 'Press',
        items: [
          { label: 'News', href: '#news' },
          { label: 'Press kit', href: '#press-kit' },
        ],
      },
      {
        heading: 'Contact',
        items: [
          { label: 'Contact us', href: '#contact' },
          { label: 'Support', href: '#support' },
        ],
      },
    ],
  },
  {
    id: 'features',
    label: 'Features',
    href: '#features',
    primary: {
      heading: 'Features',
      items: [
        { label: 'Live fleet output', href: '#live-fleet-output' },
        { label: 'Degradation alerts', href: '#degradation-alerts' },
        { label: 'Crew task tracking', href: '#crew-task-tracking' },
      ],
    },
    footerLinks: [
      { label: 'All capabilities', href: '#features' },
      { label: 'Reports & analytics', href: '#reports-analytics' },
    ],
    secondary: [
      {
        heading: 'Plants',
        items: [
          { label: 'Hydro', href: '#plants-hydro' },
          { label: 'Solar', href: '#plants-solar' },
          { label: 'Wind', href: '#plants-wind' },
        ],
      },
      {
        heading: 'Resources',
        items: [
          { label: 'Documentation', href: '#documentation' },
          { label: 'Demo roles', href: '/login#demo-accounts', route: true },
        ],
      },
    ],
  },
  {
    id: 'how-it-works',
    label: 'How it works',
    href: '#how-it-works',
    primary: {
      heading: 'How it works',
      items: [
        { label: 'Connect your plants', href: '#connect-your-plants' },
        { label: 'Telemetry every five seconds', href: '#telemetry-every-five-seconds' },
        { label: 'Flag and fix', href: '#flag-and-fix' },
      ],
    },
    footerLinks: [
      { label: 'One unified dashboard', href: '#one-dashboard' },
      { label: 'Live fleet preview', href: '#top' },
    ],
    secondary: [
      {
        heading: 'Get started',
        items: [
          { label: 'Sign up', href: '/register', route: true },
          { label: 'Log in', href: '/login', route: true },
        ],
      },
    ],
  },
  {
    id: 'contact',
    label: 'Contact',
    href: '#contact',
    primary: {
      heading: 'Contact',
      items: [
        { label: 'Contact us', href: '#contact' },
        { label: 'Book a demo', href: '#book-a-demo' },
        { label: 'Support', href: '#support' },
      ],
    },
    footerLinks: [
      { label: 'hello@gridpulse.io', href: 'mailto:hello@gridpulse.io' },
      { label: 'Open control room', href: '/login', route: true },
    ],
    secondary: [
      {
        heading: 'Visit',
        items: [{ label: 'Chitral, Khyber Pakhtunkhwa', href: '#visit-chitral' }],
      },
    ],
  },
];

function MenuAnchor({
  item,
  className,
  onSelect,
}: {
  item: NavLinkItem;
  className: string;
  onSelect: () => void;
}) {
  if (item.route) {
    return (
      <Link to={item.href} onClick={onSelect} className={className}>
        {item.label}
      </Link>
    );
  }
  return (
    <a href={item.href} onClick={onSelect} className={className}>
      {item.label}
    </a>
  );
}

/** Sticky top nav for the public landing page with full-width hover/focus mega-menus on desktop and collapsible menu on mobile. */
export default function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [escDismissed, setEscDismissed] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openMenu = (id: string) => {
    clearCloseTimer();
    setEscDismissed(false);
    setActiveMenu(id);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setActiveMenu(null);
    }, 90);
  };

  const closeImmediately = () => {
    clearCloseTimer();
    setActiveMenu(null);
  };

  useEffect(() => () => clearCloseTimer(), []);

  // Close menus on Escape, or close mobile menu if viewport grows past mobile breakpoint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setActiveMenu(null);
        setEscDismissed(true);
      }
    };
    const mq = window.matchMedia('(min-width: 768px)');
    const onResize = () => {
      if (mq.matches) setMobileOpen(false);
      else setActiveMenu(null);
    };
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onResize);
    };
  }, []);

  return (
    <header
      className="sticky top-0 z-40 border-b border-line bg-mist"
      onMouseLeave={scheduleClose}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
        <Link to="/" onMouseEnter={closeImmediately} className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-display text-[17px] font-semibold tracking-tight text-pine">GridPulse</span>
        </Link>

        <nav
          className="hidden items-center md:flex"
          aria-label="Primary"
          onMouseEnter={clearCloseTimer}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setActiveMenu(null);
              setEscDismissed(false);
            }
          }}
        >
          <ul className="flex items-center gap-7">
            {MENUS.map((m) => {
              const isOpen = activeMenu === m.id && !escDismissed;
              return (
                <li
                  key={m.id}
                  className="mega-item"
                  data-dismissed={escDismissed ? 'true' : undefined}
                  onMouseEnter={() => openMenu(m.id)}
                  onFocus={() => openMenu(m.id)}
                >
                  <a
                    href={m.href}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    onClick={closeImmediately}
                    className={clsx(
                      'inline-block py-1.5 text-[14px] font-medium transition-colors',
                      isOpen ? 'text-pine' : 'text-ink-muted hover:text-pine',
                    )}
                  >
                    {m.label}
                  </a>

                  <div
                    className={clsx(
                      'mega-panel absolute inset-x-0 top-full hidden border-b border-line bg-mist md:block',
                      isOpen && 'is-open',
                    )}
                    onMouseEnter={() => openMenu(m.id)}
                  >
                    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
                      <div className="grid max-w-4xl grid-cols-[1.55fr_1fr_1fr] gap-12">
                        <div>
                          <p className="text-[12px] font-normal text-ink-muted">{m.primary.heading}</p>
                          <ul className="mt-3 flex flex-col gap-2">
                            {m.primary.items.map((item) => (
                              <li key={item.label}>
                                <MenuAnchor
                                  item={item}
                                  onSelect={closeImmediately}
                                  className="inline-block font-display text-[26px] font-bold leading-[1.18] tracking-tight text-pine transition-colors hover:text-teal"
                                />
                              </li>
                            ))}
                          </ul>
                          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3.5">
                            {m.footerLinks.map((fl) => (
                              <MenuAnchor
                                key={fl.label}
                                item={fl}
                                onSelect={closeImmediately}
                                className="text-[12.5px] font-medium text-ink-muted transition-colors hover:text-pine"
                              />
                            ))}
                          </div>
                        </div>

                        {m.secondary.map((col) => (
                          <div key={col.heading}>
                            <p className="text-[12px] font-normal text-ink-muted">{col.heading}</p>
                            <ul className="mt-3 flex flex-col gap-2">
                              {col.items.map((item) => (
                                <li key={item.label}>
                                  <MenuAnchor
                                    item={item}
                                    onSelect={closeImmediately}
                                    className="inline-block text-[14px] font-semibold leading-snug text-pine transition-colors hover:text-teal"
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden items-center gap-2.5 md:flex" onMouseEnter={closeImmediately}>
          <ThemeToggle />
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <Link to="/register" className="btn btn-primary">Get started</Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-line-strong bg-paper text-pine"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="landing-mobile-menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="landing-mobile-menu" aria-label="Mobile" className="border-t border-line bg-mist px-4 pb-4 pt-2 md:hidden">
          <ul className="flex flex-col gap-1">
            {MENUS.map((m) => (
              <li key={m.id}>
                <a
                  href={m.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-control px-2 py-2.5 text-[15px] font-medium text-pine transition-colors hover:bg-moss"
                >
                  {m.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
            <Link to="/login" onClick={() => setMobileOpen(false)} className="btn btn-secondary w-full">Log in</Link>
            <Link to="/register" onClick={() => setMobileOpen(false)} className="btn btn-primary w-full">Get started</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
