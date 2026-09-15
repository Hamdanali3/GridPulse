import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import Ridge from '../components/Ridge';
import RingGauge from '../components/charts/RingGauge';
import { useZonedClock } from '../lib/hooks';
import { del, errorMessage, get, getPaged } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtAgo, fmtDate, fmtKw, fmtKwh, fmtNumber, kindLabel } from '../lib/format';
import type { Alert, Asset, Site, SiteSummary, SeriesPoint, WorkOrder } from '../lib/types';
import SiteSeriesChart from '../components/charts/SiteSeriesChart';
import FleetMap from '../components/charts/FleetMap';
import { AlertStatusChip, ConfirmDialog, EmptyState, ErrorNote, HealthBar, Panel, PriorityChip, SeverityChip, Spinner, StatusChip, WorkOrderStatusChip } from '../components/ui';
import { SiteDrawer } from './SitesPage';

export default function SiteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [range, setRange] = useState<24 | 72 | 168>(24);
  const clock = useZonedClock('Asia/Karachi');

  const site = useQuery({ queryKey: ['site', id], queryFn: () => get<Site>(`/sites/${id}`), refetchInterval: 15_000 });
  const summary = useQuery({ queryKey: ['site', id, 'summary'], queryFn: () => get<SiteSummary>(`/sites/${id}/summary`), refetchInterval: 15_000 });
  const series = useQuery({ queryKey: ['site', id, 'series', range], queryFn: () => get<SeriesPoint[]>(`/telemetry/sites/${id}/series`, { hours: range, bucket: range === 24 ? 15 : range === 72 ? 60 : 180 }), refetchInterval: 60_000 });
  const assets = useQuery({ queryKey: ['assets', { site_id: id }], queryFn: () => getPaged<Asset>('/assets', { site_id: id, limit: 100, sort: 'tag' }), refetchInterval: 15_000 });
  const alerts = useQuery({ queryKey: ['alerts', { site_id: id }], queryFn: () => getPaged<Alert>('/alerts', { site_id: id, limit: 8 }), refetchInterval: 15_000 });
  const workOrders = useQuery({ queryKey: ['work-orders', { site_id: id }], queryFn: () => getPaged<WorkOrder>('/work-orders', { site_id: id, limit: 8 }) });

  const remove = useMutation({
    mutationFn: () => del(`/sites/${id}`),
    onSuccess: () => { toast.success('Site deleted.'); void qc.invalidateQueries({ queryKey: ['sites'] }); navigate('/sites'); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (site.isLoading) return <Spinner label="Loading site" />;
  if (site.isError || !site.data) return <ErrorNote message={errorMessage(site.error)} />;
  const s = site.data;
  const sum = summary.data;

  return (
    <div className="space-y-5">
      <Link to="/sites" className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-pine"><ArrowLeft className="h-3.5 w-3.5" /> All sites</Link>

      <section className="panel-dark relative overflow-hidden">
        <Ridge className="pointer-events-none absolute inset-x-0 bottom-0 h-[220px] w-full opacity-60" hour={clock.hour} sun={false} snow={false} />
        <div className="relative grid gap-6 p-6 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[32px] font-semibold leading-tight text-white">{s.name}</h1>
              <StatusChip status={s.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[13.5px] text-white/60">
              <span className="tabular">{s.code}</span><span className="capitalize">{s.type}</span><span>{fmtNumber(s.capacity_mw, s.capacity_mw < 10 ? 1 : 0)} MW installed</span><span>{s.region}, {s.country}</span>{s.commissioned_at && <span>commissioned {fmtDate(s.commissioned_at)}</span>}
            </p>
            <div className="mt-6 flex flex-wrap items-end gap-8">
              <div>
                <p className="text-[12.5px] text-white/55">Output now</p>
                <p className="font-display text-[48px] font-bold leading-none text-white tabular">{fmtKw(sum?.current_output_kw ?? s.current_output_kw)}</p>
              </div>
              <div>
                <p className="text-[12.5px] text-white/55">Energy today</p>
                <p className="font-display text-[28px] font-semibold leading-none text-amber tabular">{fmtKwh(sum?.today_energy_kwh)}</p>
              </div>
              <div>
                <p className="text-[12.5px] text-white/55">Open alerts</p>
                <p className={`font-display text-[28px] font-semibold leading-none tabular ${s.open_alerts ? 'text-[#FF8A73]' : 'text-white'}`}>{s.open_alerts ?? 0}</p>
              </div>
              <div>
                <p className="text-[12.5px] text-white/55">Open work orders</p>
                <p className="font-display text-[28px] font-semibold leading-none text-white tabular">{sum?.open_work_orders ?? 0}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-4">
            {can('admin', 'engineer') && (
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit site</button>
                {can('admin') && <button className="btn btn-sm border border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => setDeleting(true)}>Delete</button>}
              </div>
            )}
            <div className="flex gap-6">
              <RingGauge value={sum?.capacity_factor_pct ?? 0} label="Capacity factor" size={92} stroke={8} track="rgba(255,255,255,0.12)" dark />
              <RingGauge value={sum?.availability_pct ?? 0} label="Availability" size={92} stroke={8} color="#7FC4C4" track="rgba(255,255,255,0.12)" dark sublabel={sum ? `${sum.assets_by_status.online ?? 0} of ${Object.values(sum.assets_by_status).reduce((a, b) => a + b, 0)} units` : undefined} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Generation and efficiency" action={<div className="flex gap-1">{([24, 72, 168] as const).map((h) => <button key={h} className={`btn btn-sm ${range === h ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange(h)}>{h === 24 ? '24 h' : h === 72 ? '3 d' : '7 d'}</button>)}</div>}>
          {series.data && series.data.length > 1 ? <SiteSeriesChart data={series.data} /> : <div className="flex h-[240px] items-center justify-center text-ink-muted">No readings in this range yet.</div>}
        </Panel>
        <Panel title="Location" bodyClassName="p-2">
          <FleetMap sites={[{ id: s.id, name: s.name, code: s.code, type: s.type, status: s.status, capacity_mw: s.capacity_mw, lat: s.lat, lng: s.lng, current_output_kw: sum?.current_output_kw ?? 0, capacity_factor_pct: sum?.capacity_factor_pct ?? 0, today_energy_kwh: sum?.today_energy_kwh ?? 0 }]} height={240} zoom={10} center={[s.lat, s.lng]} />
        </Panel>
      </section>

      <Panel title={`Units (${assets.data?.meta.total ?? 0})`} action={can('admin', 'engineer') && <Link to={`/assets?site_id=${s.id}&new=1`} className="text-[13px] font-medium text-teal">Add asset</Link>} bodyClassName="p-0">
        {assets.isLoading ? <Spinner /> : assets.data!.data.length === 0 ? <EmptyState title="No units yet" hint="Units are the generators, inverters and turbines that report telemetry." /> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Tag</th><th>Unit</th><th>Kind</th><th>Manufacturer</th><th className="text-right">Rated</th><th className="text-right">Output now</th><th className="text-right">Efficiency</th><th className="text-right">Temp</th><th>Status</th><th>Health</th></tr></thead>
            <tbody>{assets.data!.data.map((a) => (
              <tr key={a.id}>
                <td className="tabular text-ink-muted">{a.tag}</td>
                <td><Link to={`/assets?q=${a.tag}`} className="font-medium text-pine hover:underline">{a.name}</Link></td>
                <td>{kindLabel(a.kind)}</td>
                <td className="text-ink-muted">{a.manufacturer ?? '—'}</td>
                <td className="text-right tabular">{fmtKw(a.rated_kw)}</td>
                <td className="text-right tabular font-medium text-pine">{fmtKw(a.latest?.power_kw)}</td>
                <td className="text-right tabular">{a.latest ? `${a.latest.efficiency_pct.toFixed(1)}%` : '—'}</td>
                <td className="text-right tabular">{a.latest ? `${a.latest.temperature_c.toFixed(0)} °C` : '—'}</td>
                <td><StatusChip status={a.status} /></td>
                <td><HealthBar value={a.health_score} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent alerts" action={<Link to={`/alerts?site_id=${s.id}`} className="text-[13px] font-medium text-teal">All</Link>} bodyClassName="p-0">
          {alerts.data?.data.length ? <ul className="divide-y divide-line">{alerts.data.data.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-5 py-3"><SeverityChip severity={a.severity} /><div className="min-w-0 flex-1"><p className="truncate text-[13.5px]">{a.message}</p><p className="text-[12px] text-ink-muted">{a.asset?.tag} · {fmtAgo(a.created_at)}</p></div><AlertStatusChip status={a.status} /></li>
          ))}</ul> : <EmptyState title="No alerts for this site" />}
        </Panel>
        <Panel title="Work orders" action={<Link to={`/work-orders?site_id=${s.id}`} className="text-[13px] font-medium text-teal">All</Link>} bodyClassName="p-0">
          {workOrders.data?.data.length ? <ul className="divide-y divide-line">{workOrders.data.data.map((w) => (
            <li key={w.id} className="flex items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-medium text-pine">{w.title}</p><p className="text-[12px] text-ink-muted">{w.assignee?.name ?? 'Unassigned'}{w.due_at && ` · due ${fmtDate(w.due_at)}`}</p></div><PriorityChip priority={w.priority} /><WorkOrderStatusChip status={w.status} /></li>
          ))}</ul> : <EmptyState title="No work orders for this site" />}
        </Panel>
      </section>

      <SiteDrawer site={editing ? s : null} onClose={() => setEditing(false)} />
      <ConfirmDialog open={deleting} title={`Delete ${s.name}?`} message="This removes the site with all its assets, telemetry, alerts and work orders. There is no undo." onCancel={() => setDeleting(false)} onConfirm={() => remove.mutate()} busy={remove.isPending} />
    </div>
  );
}
