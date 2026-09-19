import Reveal from './Reveal';

const stats = [
  { value: '11', label: 'Plants across Upper & Lower Chitral' },
  { value: '190 MW', label: 'Installed capacity, hydro + solar + wind' },
  { value: '5 s', label: 'Telemetry cadence, fleet-wide' },
  { value: '3', label: 'Roles — admin, engineer, viewer' },
];

export default function Stats() {
  return (
    <section aria-label="GridPulse in numbers" className="border-y border-line bg-pine py-12 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center lg:text-left">
              <p className="font-display text-[34px] font-bold leading-none text-amber tabular sm:text-[40px]">{s.value}</p>
              <p className="mt-2 text-[13px] leading-snug text-white/70">{s.label}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
