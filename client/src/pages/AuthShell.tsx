import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../layouts/AppLayout';
import { useZonedClock } from '../lib/hooks';
import { ThemeToggle } from '../lib/theme';

/**
 * Minimalist split auth layout — clean architectural surfaces, 1px hairline dividers, zero decorative SVGs.
 */
export default function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const clock = useZonedClock('Asia/Karachi');
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <aside className="hidden flex-col justify-between border-r border-line bg-paper px-12 py-10 lg:flex">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <Logo size={26} />
            <span className="text-[16px] font-semibold tracking-tight text-pine">GridPulse</span>
          </Link>
          <span className="tabular text-[12px] text-ink-faint">Chitral · {clock.time}</span>
        </div>

        <div className="my-auto py-12">
          <p className="eyebrow">Control room</p>
          <h2 className="mt-3 max-w-[17ch] text-[38px] font-semibold leading-[1.08] tracking-[-0.03em] text-pine">
            Every megawatt from the Hindu Kush, on one screen.
          </h2>
          <p className="mt-5 max-w-[42ch] text-[14.5px] leading-relaxed text-ink-muted">
            Live generation from Chitral's hydro plants and solar fields. Alerts the moment a unit drifts. Work
            orders that close the loop.
          </p>
        </div>

        <ul className="grid grid-cols-3 gap-6 border-t border-line pt-6 text-[12.5px] text-ink-muted">
          <li>
            <span className="block text-[20px] font-semibold text-pine tabular">190 MW</span>
            <span className="mt-0.5 block">across Chitral district</span>
          </li>
          <li>
            <span className="block text-[20px] font-semibold text-pine tabular">11</span>
            <span className="mt-0.5 block">plants, Upper & Lower Chitral</span>
          </li>
          <li>
            <span className="block text-[20px] font-semibold text-pine tabular">5 s</span>
            <span className="mt-0.5 block">telemetry cadence</span>
          </li>
        </ul>
      </aside>

      <main className="flex flex-col bg-mist px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2.5 lg:hidden">
            <Logo size={24} />
            <span className="text-[16px] font-semibold text-pine">GridPulse</span>
          </Link>
          <ThemeToggle className="ml-auto" />
        </div>

        <div className="my-auto w-full max-w-[380px] self-center py-10">
          <h1 className="text-[24px] font-semibold tracking-[-0.022em] text-pine">{title}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <p className="mt-7 text-[13px] text-ink-muted">{footer}</p>
        </div>

        <footer className="flex w-full max-w-[380px] flex-wrap items-center justify-between gap-x-4 gap-y-1 self-center border-t border-line pt-4 text-[12px] text-ink-faint">
          <span>© 2026 GridPulse</span>
          <nav aria-label="Footer" className="flex items-center gap-4">
            <Link to="/" className="transition-colors hover:text-pine">Home</Link>
            <Link to="/login" className="transition-colors hover:text-pine">Log in</Link>
            <Link to="/register" className="transition-colors hover:text-pine">Sign up</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
