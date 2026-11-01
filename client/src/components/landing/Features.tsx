import Reveal from './Reveal';

const features = [
  { id: 'live-fleet-output', title: 'Live fleet output', text: 'Real-time megawatts and capacity factor across every plant, refreshed every 5 seconds.' },
  { id: 'sites-and-assets', title: 'Sites & assets', text: 'Every plant, turbine and inverter catalogued with the telemetry that keeps it honest.' },
  { id: 'degradation-alerts', title: 'Alerting', text: 'Critical and warning rules fire on live readings, so problems surface before they escalate.' },
  { id: 'crew-task-tracking', title: 'Work orders', text: 'Track maintenance from planned to done, tied back to the asset and the alert that raised it.' },
  { id: 'reports-analytics', title: 'Reports & analytics', text: 'Energy and availability broken down by day and by plant, for planning and for handovers.' },
  { id: 'technology-mix', title: 'Technology mix', text: 'Hydro, solar and wind generation compared side by side across the whole district.' },
  { id: 'team', title: 'Role-based access', text: 'Admins, engineers and viewers each see exactly what their role needs, nothing more.' },
  { id: 'audit-log', title: 'Audit log', text: 'Every change is recorded — who did what, and when — for accountability across the team.' },
];

export default function Features() {
  return (
    <section id="features" className="scroll-mt-14 border-t border-line py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="max-w-[56ch]">
          <p className="eyebrow">What's inside</p>
          <h2 className="mt-3 text-[26px] font-semibold leading-[1.18] tracking-[-0.022em] text-pine sm:text-[30px]">
            Everything an operations team needs, and nothing it doesn't.
          </h2>
        </Reveal>

        <div className="mt-12 grid border-l border-t border-line bg-paper sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <div key={f.title} id={f.id} className="scroll-mt-24 border-b border-r border-line">
              {f.id === 'technology-mix' && (
                <>
                  <span id="plants-hydro" className="block scroll-mt-24" aria-hidden />
                  <span id="plants-solar" className="block scroll-mt-24" aria-hidden />
                  <span id="plants-wind" className="block scroll-mt-24" aria-hidden />
                </>
              )}
              <Reveal delay={Math.min(i, 4) * 40} className="flex h-full flex-col justify-between gap-6 p-6">
                <span className="tabular text-[11px] font-medium text-ink-faint">0{i + 1}</span>
                <div>
                  <h3 className="text-[15px] font-semibold text-pine">{f.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">{f.text}</p>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
