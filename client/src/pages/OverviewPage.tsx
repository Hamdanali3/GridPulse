import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Moon, Sun } from 'lucide-react';
import { get, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAnimatedNumber, useZonedClock } from '../lib/hooks';
import { fmtAgo, fmtKw, fmtKwh, fmtPct, humanize } from '../lib/format';
import type { DashboardOverview, FleetLive, SeriesPoint } from '../lib/types';
import FleetLiveChart from '../components/charts/FleetLiveChart';
import FleetMap from '../components/charts/FleetMap';
import TechnologyAreaChart, { type TypePoint } from '../components/charts/TechnologyAreaChart';
import RingGauge from '../components/charts/RingGauge';
import SeverityDonut from '../components/charts/SeverityDonut';
import Sparkline from '../components/charts/Sparkline';
import { EmptyState, ErrorNote, Panel, SeverityChip, TypeGlyph } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';
import { chitralSeason, sunTimes } from '../lib/sun';
import { Droplets, Sunrise, Sunset } from 'lucide-react';

const LIVE_MS = 5000;

export default function OverviewPage() {
  const { user } = useAuth();
  const clock = useZonedClock('Asia/Karachi');
  const live = useQuery({ queryKey: ['fleet', 'live'], queryFn: () => get<FleetLive>('/telemetry/fleet/live'), refetchInterval: LIVE_MS });
  const series = useQuery({ queryKey: ['fleet', 'series'], queryFn: () => get<SeriesPoint[]>('/telemetry/fleet/series', { minutes: 60, bucket: 1 }), refetchInterval: LIVE_MS });
  const overview = useQuery({ queryKey: ['dashboard', 'overview'], queryFn: () => get<DashboardOverview>('/dashboard/overview'), refetchInterval: 30_000 });
  const byType = useQuery({ queryKey: ['fleet', 'series', 'type'], queryFn: () => get<TypePoint[]>('/telemetry/fleet/series', { minutes: 1440, bucket: 30, by: 'type' }), refetchInterval: 60_000 });
  const sparks = useQuery({ queryKey: ['sites', 'sparklines'], queryFn: () => get<Record<string, number[]>>('/telemetry/sites/sparklines', { hours: 24, bucket: 60 }), refetchInterval: 60_000 });

  const fleetKwTarget = live.data?.fleet_kw ?? overview.data?.fleet.current_output_kw ?? 0;
  const fleetKw = useAnimatedNumber(fleetKwTarget);

  if (overview.isLoading) return <OverviewSkeleton />;
  if (overview.isError) return <ErrorNote message={errorMessage(overview.error)} />;
  const o = overview.data!;
  const capacityKw = live.data?.capacity_kw ?? o.fleet.capacity_kw;
  const cf = capacityKw ? (fleetKwTarget / capacityKw) * 100 : 0;
  const daylight = clock.hour >= 6 && clock.hour < 19;
  const greeting = clock.hour < 12 ? 'Good morning' : clock.hour < 18 ? 'Good afternoon' : 'Good evening';
  const typeRows = Object.entries(o.generation_by_type).map(([type, v]) => ({ type, kw: v.kw, capacity: v.capacity_kw }));
  const ranked = [...o.sites].sort((a, b) => b.capacity_factor_pct - a.capacity_factor_pct);
  const sun = sunTimes(new Date(), 35.85, 71.79);
  const season = chitralSeason(new Date());

  return (
    <div className="space-y-5">
      <div className="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-pine">{greeting}, {user?.name.split(' ')[0]}.</h1>
          <p className="text-ink-muted">Chitral's fleet right now, {daylight ? 'solar hours' : 'night shift'} at {clock.time} local.</p>
        </div>
        <Link to="/reports" className="btn btn-secondary btn-sm">Energy report <ArrowUpRight className="h-3.5 w-3.5" /></Link>
      </div>

      {/* Hero: live fleet output on the dark control panel */}
      <section className="panel-dark rise relative overflow-hidden">
        <div className="chitral-strip" aria-hidden />
        <div className="grid gap-6 p-6 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-[13px] text-white/60">
              <span className="pulse-dot" aria-hidden />
              Live fleet output
              {live.data?.recorded_at && <span className="text-white/40">· {fmtAgo(live.data.recorded_at)}</span>}
            </div>
            <p className="mt-2 font-display text-[60px] font-bold leading-none tracking-tight text-white tabular">{fmtKw(fleetKw, 1)}</p>
            <p className="mt-2 text-white/65">
              <span className="font-medium text-amber tabular">{fmtPct(cf)}</span> of {fmtKw(capacityKw, 0)} installed
            </p>
          </div>
          <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
            <RingGauge value={cf} label="Capacity factor" size={96} stroke={9} track="rgba(255,255,255,0.12)" dark sublabel="of installed MW" />
            <RingGauge value={o.fleet.availability_pct} label="Availability" size={96} stroke={9} color="#7FC4C4" track="rgba(255,255,255,0.12)" dark sublabel={`${live.data?.reporting_assets ?? o.fleet.total_assets} of ${o.fleet.total_assets} assets`} />
            <div className="hidden text-right sm:block">
              <p className="text-[12px] text-white/50">Right now</p>
              <p className="mt-1 flex items-center justify-end gap-1.5 text-[13.5px] font-medium text-white">
                {daylight ? <Sun className="h-4 w-4 text-amber" /> : <Moon className="h-4 w-4 text-[#7FC4C4]" />}
                {daylight ? 'Daylight' : 'Night'}
              </p>
              <p className="text-[11.5px] text-white/45">{daylight ? 'solar contributing' : 'hydro carrying the load'}</p>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          {series.data && series.data.length > 1 ? (
            <FleetLiveChart data={series.data} height={250} dark />
          ) : (
            <div className="flex h-[250px] items-center justify-center text-white/60">
              Waiting for readings. Start the simulator: <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-[12.5px]">php artisan schedule:work</code>
            </div>
          )}
          <p className="mt-1 text-right text-[12px] text-white/40">Last 60 minutes, one-minute buckets, redrawn every 5 s</p>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 px-6 py-3 text-[12.5px] text-white/60">
          <span className="flex items-center gap-1.5"><Sunrise className="h-3.5 w-3.5 text-amber" /> Sunrise <span className="font-medium text-white tabular">{sun.sunrise}</span></span>
          <span className="flex items-center gap-1.5"><Sunset className="h-3.5 w-3.5 text-amber" /> Sunset <span className="font-medium text-white tabular">{sun.sunset}</span></span>
          <span>{sun.daylightHours} h of solar window at 35.9° N</span>
          <span className="flex items-center gap-1.5"><Droplets className="h-3.5 w-3.5 text-[#7FC4C4]" /> {season.label} <span className="text-white/40">· {season.note}</span></span>
          <span className="ml-auto text-white/35">Chitral, Khyber Pakhtunkhwa · چترال</span>
        </div>
      </section>

      {/* KPI row */}
      <section className="rise rise-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Energy today" value={fmtKwh(o.fleet.today_energy_kwh)} note="since midnight UTC" accent="amber" />
        <Kpi label="Sites online" value={`${o.sites_by_status.online ?? 0} of ${o.fleet.total_sites}`} note={[o.sites_by_status.degraded ? `${o.sites_by_status.degraded} degraded` : null, o.sites_by_status.maintenance ? `${o.sites_by_status.maintenance} in maintenance` : null, o.sites_by_status.offline ? `${o.sites_by_status.offline} offline` : null].filter(Boolean).join(' · ') || 'all healthy'} to="/sites" accent="teal" />
        <Kpi label="Open alerts" value={String(o.alerts.open)} note={`${o.alerts.by_severity.critical ?? 0} critical · ${o.alerts.by_severity.warning ?? 0} warning`} tone={o.alerts.by_severity.critical ? 'ember' : undefined} to="/alerts" accent="ember" />
        <Kpi label="Work due this week" value={String(o.work_orders.due_this_week)} note={`${o.work_orders.by_status.in_progress ?? 0} in progress · ${o.work_orders.by_status.blocked ?? 0} blocked`} to="/work-orders" accent="pine" />
      </section>

      <section className="rise rise-3">
        <Panel title="Chitral fleet map" action={<span className="text-[12.5px] text-ink-muted">{o.fleet.total_sites} plants across Upper and Lower Chitral · click a pin to open the plant</span>} bodyClassName="p-2">
          <FleetMap sites={o.sites} height={540} />
        </Panel>
      </section>

      <section className="rise rise-3 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Needs attention" action={<div className="flex items-center gap-3"><SeverityDonut bySeverity={o.alerts.by_severity} size={56} /><Link to="/alerts" className="text-[13px] font-medium text-teal">All alerts</Link></div>} bodyClassName="p-0">
          {o.alerts.recent.length === 0 ? (
            <EmptyState title="No open alerts" hint="Every unit is inside its thresholds." />
          ) : (
            <ul className="divide-y divide-line">
              {o.alerts.recent.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.severity === 'critical' ? 'bg-ember' : a.severity === 'warning' ? 'bg-amber' : 'bg-teal'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-snug text-ink">{a.message}</p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">{a.site?.name} · {fmtAgo(a.created_at)}</p>
                  </div>
                  <SeverityChip severity={a.severity} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Generation by technology" action={<div className="flex gap-3 text-[12.5px] text-ink-muted">{typeRows.map((r) => <span key={r.type}><span className="font-medium text-pine tabular">{fmtKw(r.kw, 1)}</span> {humanize(r.type)}</span>)}</div>}>
          {byType.data && byType.data.length > 1 ? <><TechnologyAreaChart data={byType.data} /><p className="mt-1 text-right text-[12px] text-ink-faint">Last 24 hours, 30-minute buckets, stacked</p></> : <div className="flex h-[260px] items-center justify-center text-ink-muted">Collecting readings…</div>}
        </Panel>
        <Panel title="Plant performance now" action={<Link to="/sites" className="text-[13px] font-medium text-teal">All sites</Link>} bodyClassName="p-0" className="lg:col-span-2">
          <ul className="grid divide-y divide-line lg:grid-cols-2 lg:divide-y-0 lg:[&>li:nth-child(n+3)]:border-t lg:[&>li:nth-child(odd)]:border-r lg:[&>li]:border-line">
            {ranked.map((s) => (
              <li key={s.id}>
                <Link to={`/sites/${s.id}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-2.5 hover:bg-moss/40">
                  <span className="flex min-w-0 items-center gap-2">
                    <TypeGlyph type={s.type} />
                    <span className="min-w-0 truncate text-[13.5px] font-medium text-pine">{s.name}</span>
                    <span className="hidden shrink-0 whitespace-nowrap text-[12px] text-ink-faint xl:inline">{s.code}</span>
                  </span>
                  <Sparkline values={sparks.data?.[String(s.id)] ?? []} width={96} height={26} color={s.type === 'solar' ? '#F2A93B' : '#2E8B8B'} />
                  <span className="w-[120px] text-right">
                    <span className="block text-[13.5px] font-semibold text-pine tabular">{fmtKw(s.current_output_kw)}</span>
                    <span className="flex items-center justify-end gap-1.5 text-[11.5px] text-ink-muted">
                      <span className="h-1 w-12 overflow-hidden rounded-full bg-moss"><span className="block h-full rounded-full bg-amber" style={{ width: `${Math.min(100, s.capacity_factor_pct)}%` }} /></span>
                      <span className="w-8 text-right tabular">{fmtPct(s.capacity_factor_pct, 0)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </div>
  );
}

function Kpi({ label, value, note, tone, to, accent }: { label: string; value: string; note?: string; tone?: 'ember'; to?: string; accent: 'amber' | 'teal' | 'ember' | 'pine' }) {
  const bar = { amber: 'bg-amber', teal: 'bg-teal', ember: 'bg-ember', pine: 'bg-pine' }[accent];
  const body = (
    <div className={`panel relative h-full overflow-hidden p-5 ${to ? 'card-link' : ''}`}>
      <span className={`absolute left-0 top-4 h-8 w-1 rounded-r ${bar}`} aria-hidden />
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className={`mt-1 font-display text-[30px] font-semibold leading-none tabular ${tone === 'ember' ? 'text-ember' : 'text-pine'}`}>{value}</p>
      {note && <p className="mt-2 text-[12.5px] text-ink-faint">{note}</p>}
    </div>
  );
  return to ? <Link to={to} className="block rounded-panel">{body}</Link> : body;
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading the fleet">
      <Skeleton className="h-8 w-72" />
      <div className="panel-dark grid gap-6 p-6 lg:grid-cols-[320px_1fr]">
        <div><Skeleton className="mb-3 h-3 w-32 bg-white/10" /><Skeleton className="mb-3 h-14 w-56 bg-white/10" /><Skeleton className="h-3 w-40 bg-white/10" /></div>
        <Skeleton className="h-[250px] w-full bg-white/10" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="panel p-5"><Skeleton className="mb-3 h-3 w-24" /><Skeleton className="mb-3 h-8 w-32" /><Skeleton className="h-3 w-40" /></div>)}</div>
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]"><Skeleton className="h-[480px]" /><Skeleton className="h-[480px]" /></div>
    </div>
  );
}
