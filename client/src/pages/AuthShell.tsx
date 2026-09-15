import type { ReactNode } from 'react';
import { Logo } from '../layouts/AppLayout';
import Ridge from '../components/Ridge';
import { useZonedClock } from '../lib/hooks';

/**
 * Split auth layout. The left panel carries the product promise over a layered Hindu Kush ridge with
 * the sun positioned by Chitral local time. If site photography is supplied it goes behind the ridge
 * (see docs/IMAGES.md).
 */
export default function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const clock = useZonedClock('Asia/Karachi');
  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-pine px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="relative z-10 flex items-center gap-2.5">
          <Logo size={32} />
          <span className="font-display text-[20px] font-semibold tracking-tight">GridPulse</span>
        </div>
        <div className="relative z-10 mt-auto pb-24">
          <h2 className="max-w-[16ch] font-display text-[46px] font-semibold leading-[1.04] tracking-tight">
            Every megawatt from the Hindu Kush, on one screen.
          </h2>
          <p className="mt-5 max-w-[42ch] text-[15.5px] leading-relaxed text-white/70">
            Live generation from Chitral's hydro plants and solar fields. Alerts the moment a unit drifts. Work
            orders that close the loop.
          </p>
          <ul className="mt-8 flex flex-wrap gap-x-10 gap-y-4 text-[13px] text-white/60">
            <li><span className="whitespace-nowrap font-display text-[22px] font-semibold text-amber tabular">190 MW</span><br />across Chitral district</li>
            <li><span className="font-display text-[22px] font-semibold text-white tabular">11</span><br />plants, Upper and Lower Chitral</li>
            <li><span className="font-display text-[22px] font-semibold text-white tabular">5 s</span><br />telemetry cadence</li>
          </ul>
        </div>
        <Ridge className="pointer-events-none absolute inset-x-0 bottom-0 h-[300px] w-full" hour={clock.hour} snow={false} />
        <p className="absolute bottom-4 right-6 z-10 text-[11.5px] text-white/40">Chitral · {clock.time}</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={30} />
            <span className="font-display text-[19px] font-semibold text-pine">GridPulse</span>
          </div>
          <h1 className="text-[28px] font-semibold text-pine">{title}</h1>
          <p className="mt-1.5 text-ink-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-[13.5px] text-ink-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}
