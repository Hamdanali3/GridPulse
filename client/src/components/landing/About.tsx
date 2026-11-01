import Reveal from './Reveal';

const points = [
  'Telemetry lands every 5 seconds, from Golen Gol down to the smallest solar array.',
  'Alert rules catch degraded output early, before a dip becomes an outage.',
  'Work orders keep field crews and dispatch on the same page, start to close.',
  'Hydro, solar and wind read side by side, so a shortfall on one technology is obvious against the rest.',
];

export default function About() {
  return (
    <section id="about" className="scroll-mt-14 border-t border-line py-20 md:py-28">
      <span id="news" className="block scroll-mt-24" aria-hidden />
      <span id="press-kit" className="block scroll-mt-24" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="grid gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:gap-16">
          <div id="our-story" className="scroll-mt-24">
            <p className="eyebrow">Why GridPulse</p>
            <h2 className="mt-3 text-[26px] font-semibold leading-[1.18] tracking-[-0.022em] text-pine sm:text-[30px]">
              Built for a mixed fleet, in a district where a truck roll can take half a day.
            </h2>
            <p className="mt-4 max-w-[50ch] text-[14.5px] leading-relaxed text-ink-muted">
              Chitral runs hydro, solar and wind side by side across a remote, mountainous grid. GridPulse
              watches all eleven plants from one dashboard, so operators catch a failing inverter or a stalled
              turbine long before someone has to drive out to find it.
            </p>
          </div>

          <ul className="grid border-l border-t border-line bg-paper sm:grid-cols-2">
            {points.map((text, idx) => (
              <li key={text} className="flex flex-col justify-between gap-6 border-b border-r border-line p-6">
                <span className="tabular text-[11px] font-medium text-ink-faint">0{idx + 1}</span>
                <p className="text-[14px] leading-relaxed text-ink">{text}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
