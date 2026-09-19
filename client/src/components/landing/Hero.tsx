import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import RingGauge from '../charts/RingGauge';
import Sparkline from '../charts/Sparkline';
import { fmtKw } from '../../lib/format';

// Illustrative sample values for the preview card only — the real dashboard reads live
// telemetry once you're signed in. Shaped like a real reading, not a fabricated testimonial.
const SAMPLE_TREND = [61200, 63400, 60800, 68900, 71200, 69800, 74100, 76300, 73900, 78200, 80100, 77400];
const SAMPLE_FLEET_KW = 77400;
const SAMPLE_CAPACITY_FACTOR = 68;
const SAMPLE_AVAILABILITY = 96;

export default function Hero() {
  // Small mount fade for the preview card, since it renders before layout settles on slow devices.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section id="top" className="mx-auto max-w-6xl px-4 pb-16 pt-14 md:px-8 md:pb-24 md:pt-20">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
        <div>
          <p className="chip bg-moss text-pine">Chitral, Khyber Pakhtunkhwa</p>
          <h1 className="mt-4 font-display text-[36px] font-bold leading-[1.08] tracking-tight text-pine sm:text-[44px] lg:text-[52px]">
            One screen for every hydro, solar and wind plant in the valley.
          </h1>
          <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-ink-muted">
            GridPulse streams telemetry from eleven plants across Upper and Lower Chitral every five seconds,
            flags degraded output before it becomes downtime, and gives crews one place to track the fix.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register" className="btn btn-primary">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="btn btn-secondary">Log in</Link>
          </div>
          <p className="mt-4 text-[13px] text-ink-faint">No card required — sign in with any of the three demo roles to look around.</p>
        </div>

        <div
          className={`panel-dark relative overflow-hidden transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}
          aria-label="Preview of the live fleet dashboard, with illustrative numbers"
        >
          <div className="chitral-strip" aria-hidden />
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[12.5px] text-white/60">
              <span className="pulse-dot" aria-hidden />
              Live fleet output
              <span className="ml-auto rounded-chip bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-white/70">preview</span>
            </div>
            <p className="mt-2 font-display text-[42px] font-bold leading-none tracking-tight text-white tabular sm:text-[48px]">
              {fmtKw(SAMPLE_FLEET_KW, 1)}
            </p>
            <div className="mt-3">
              <Sparkline values={SAMPLE_TREND} width={260} height={44} color="#F2A93B" />
            </div>
            <div className="mt-5 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
              <RingGauge value={SAMPLE_CAPACITY_FACTOR} label="Capacity factor" size={84} stroke={8} track="rgba(255,255,255,0.12)" dark />
              <RingGauge
                value={SAMPLE_AVAILABILITY}
                label="Availability"
                size={84}
                stroke={8}
                color="#7FC4C4"
                track="rgba(255,255,255,0.12)"
                dark
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
