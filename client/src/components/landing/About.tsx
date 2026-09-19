import { Droplets, Radio, ShieldAlert, Wrench } from 'lucide-react';
import Reveal from './Reveal';

const points = [
  { icon: Radio, text: 'Telemetry lands every 5 seconds, from Golen Gol down to the smallest solar array.' },
  { icon: ShieldAlert, text: 'Alert rules catch degraded output early, before a dip becomes an outage.' },
  { icon: Wrench, text: 'Work orders keep field crews and dispatch on the same page, start to close.' },
];

export default function About() {
  return (
    <section id="about" className="bg-paper/60 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
          <div>
            <p className="chip bg-teal-soft text-teal">Why GridPulse</p>
            <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight text-pine sm:text-[32px]">
              Built for a mixed fleet, in a district where a truck roll can take half a day.
            </h2>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-muted">
              Chitral runs hydro, solar and wind side by side across a remote, mountainous grid. GridPulse
              watches all eleven plants from one dashboard, so operators catch a failing inverter or a stalled
              turbine long before someone has to drive out to find it.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {points.map((p) => (
              <li key={p.text} className="panel flex flex-col gap-3 p-5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-control bg-moss text-pine">
                  <p.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <p className="text-[14px] leading-relaxed text-ink">{p.text}</p>
              </li>
            ))}
            <li className="panel flex flex-col gap-3 p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-control bg-moss text-pine">
                <Droplets className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <p className="text-[14px] leading-relaxed text-ink">
                Hydro, solar and wind read side by side, so a shortfall on one technology is obvious against the rest.
              </p>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
