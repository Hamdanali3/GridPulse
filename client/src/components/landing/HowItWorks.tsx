import Reveal from './Reveal';

const steps = [
  { id: 'connect-your-plants', title: 'Connect your sites', text: 'Register each plant, its assets and their capacity — hydro, solar or wind.' },
  { id: 'telemetry-every-five-seconds', title: 'Telemetry streams in', text: 'Readings land every 5 seconds and feed the live fleet view automatically.' },
  { id: 'flag-and-fix', title: 'Alerts and work orders', text: 'Degraded output raises an alert; a crew picks it up as a tracked work order.' },
  { id: 'one-dashboard', title: 'One dashboard', text: 'Output, alerts, maintenance and reports — all from a single screen.' },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-14 border-t border-line py-20 md:py-28">
      <span id="documentation" className="block scroll-mt-24" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="max-w-[56ch]">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 text-[26px] font-semibold leading-[1.18] tracking-[-0.022em] text-pine sm:text-[30px]">
            From a new site to a closed work order, in four steps.
          </h2>
        </Reveal>

        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} id={s.id} className="scroll-mt-24 border-t border-line pt-5">
              <Reveal delay={i * 50} className="flex flex-col gap-2">
                <span className="tabular text-[11.5px] font-medium text-ink-faint">0{i + 1}</span>
                <h3 className="mt-1 text-[15px] font-semibold text-pine">{s.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-ink-muted">{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
