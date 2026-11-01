import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import RingGauge from '../charts/RingGauge';
import Sparkline from '../charts/Sparkline';
import { fmtKw } from '../../lib/format';

const SAMPLE_TREND = [61200, 63400, 60800, 68900, 71200, 69800, 74100, 76300, 73900, 78200, 80100, 77400];
const SAMPLE_FLEET_KW = 77400;
const SAMPLE_CAPACITY_FACTOR = 68;
const SAMPLE_AVAILABILITY = 96;

export default function Hero() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section id="top" className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
      <div className="grid gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-16">
        <div>
          <p className="eyebrow">Chitral, Khyber Pakhtunkhwa</p>
          <h1 className="mt-4 text-[36px] font-semibold leading-[1.08] tracking-[-0.03em] text-pine sm:text-[44px] lg:text-[50px]">
            One screen for every hydro, solar and wind plant in the valley.
          </h1>
          <p className="mt-5 max-w-[50ch] text-[15.5px] leading-relaxed text-ink-muted">
            GridPulse streams telemetry from eleven plants across Upper and Lower Chitral every five seconds,
            flags degraded output before it becomes downtime, and gives crews one place to track the fix.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Link to="/register" className="btn btn-primary">
              Get started <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Link>
            <Link to="/login" className="btn btn-secondary">Log in</Link>
          </div>
          <p className="mt-4 text-[12.5px] text-ink-faint">No card required — sign in with any of the three demo roles to look around.</p>
        </div>

        <div
          className={`panel-dark relative p-6 transition-opacity duration-500 sm:p-7 ${ready ? 'opacity-100' : 'opacity-0'}`}
          aria-label="Preview of the live fleet dashboard, with illustrative numbers"
        >
          <div className="flex items-center gap-2 text-[12px] text-white/65">
            <span className="pulse-dot" aria-hidden />
            Live fleet output
            <span className="ml-auto border border-white/15 px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.06em] text-white/65">preview</span>
          </div>
          <p className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.03em] text-white tabular sm:text-[46px]">
            {fmtKw(SAMPLE_FLEET_KW, 1)}
          </p>
          <div className="mt-4">
            <Sparkline values={SAMPLE_TREND} width={260} height={42} color="#F2A93B" strokeWidth={1.5} />
          </div>
          <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
            <RingGauge value={SAMPLE_CAPACITY_FACTOR} label="Capacity factor" size={80} stroke={6} track="rgba(255,255,255,0.12)" dark />
            <RingGauge
              value={SAMPLE_AVAILABILITY}
              label="Availability"
              size={80}
              stroke={6}
              color="#7FC4C4"
              track="rgba(255,255,255,0.12)"
              dark
            />
          </div>
        </div>
      </div>
    </section>
  );
}
