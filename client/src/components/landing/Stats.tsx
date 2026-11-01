import Reveal from './Reveal';

const stats = [
  { value: '11', label: 'Plants across Upper & Lower Chitral' },
  { value: '190 MW', label: 'Installed capacity, hydro + solar + wind' },
  { value: '5 s', label: 'Telemetry cadence, fleet-wide' },
  { value: '3', label: 'Roles — admin, engineer, viewer' },
];

export default function Stats() {
  return (
    <section id="where-we-operate" aria-label="GridPulse in numbers" className="scroll-mt-14 border-y border-line bg-paper">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
          {stats.map((s) => (
            <div key={s.label} className="py-10 lg:px-8 lg:first:pl-0 lg:last:pr-0">
              <p className="text-[32px] font-semibold leading-none tracking-[-0.03em] text-pine tabular sm:text-[36px]">{s.value}</p>
              <p className="mt-2.5 text-[13px] leading-snug text-ink-muted">{s.label}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
