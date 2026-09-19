import { Bell, Gauge, LayoutDashboard, PlugZap } from 'lucide-react';
import Reveal from './Reveal';

const steps = [
  { icon: PlugZap, title: 'Connect your sites', text: 'Register each plant, its assets and their capacity — hydro, solar or wind.' },
  { icon: Gauge, title: 'Telemetry streams in', text: 'Readings land every 5 seconds and feed the live fleet view automatically.' },
  { icon: Bell, title: 'Alerts and work orders', text: 'Degraded output raises an alert; a crew picks it up as a tracked work order.' },
  { icon: LayoutDashboard, title: 'One dashboard', text: 'Output, alerts, maintenance and reports — all from a single screen.' },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-paper/60 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="max-w-[60ch]">
          <p className="chip bg-teal-soft text-teal">How it works</p>
          <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight text-pine sm:text-[32px]">
            From a new site to a closed work order, in four steps.
          </h2>
        </Reveal>

        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 70} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pine font-display text-[14px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <s.icon className="h-5 w-5 text-teal" strokeWidth={1.75} />
                </div>
                <h3 className="font-display text-[15.5px] font-semibold text-pine">{s.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-ink-muted">{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
