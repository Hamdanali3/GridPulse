import { Activity, Bell, ClipboardList, Cpu, FileBarChart, MapPinned, ShieldCheck, Users } from 'lucide-react';
import Reveal from './Reveal';

const features = [
  { icon: Activity, title: 'Live fleet output', text: 'Real-time megawatts and capacity factor across every plant, refreshed every 5 seconds.' },
  { icon: MapPinned, title: 'Sites & assets', text: 'Every plant, turbine and inverter catalogued with the telemetry that keeps it honest.' },
  { icon: Bell, title: 'Alerting', text: 'Critical and warning rules fire on live readings, so problems surface before they escalate.' },
  { icon: ClipboardList, title: 'Work orders', text: 'Track maintenance from planned to done, tied back to the asset and the alert that raised it.' },
  { icon: FileBarChart, title: 'Reports & analytics', text: 'Energy and availability broken down by day and by plant, for planning and for handovers.' },
  { icon: Cpu, title: 'Technology mix', text: 'Hydro, solar and wind generation compared side by side across the whole district.' },
  { icon: Users, title: 'Role-based access', text: 'Admins, engineers and viewers each see exactly what their role needs, nothing more.' },
  { icon: ShieldCheck, title: 'Audit log', text: 'Every change is recorded — who did what, and when — for accountability across the team.' },
];

export default function Features() {
  return (
    <section id="features" className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="max-w-[60ch]">
          <p className="chip bg-amber/15 text-amber-deep">What's inside</p>
          <h2 className="mt-3 font-display text-[28px] font-semibold leading-tight text-pine sm:text-[32px]">
            Everything an operations team needs, and nothing it doesn't.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={Math.min(i, 4) * 60} className="card-link panel h-full p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-moss text-pine">
                <f.icon className="h-[19px] w-[19px]" strokeWidth={1.75} />
              </span>
              <h3 className="mt-4 font-display text-[15.5px] font-semibold text-pine">{f.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{f.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
