import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage, getPaged, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtAgo, fmtDateTime, humanize } from '../lib/format';
import type { Alert, AlertStatus, Severity, Site, WorkOrder } from '../lib/types';
import { AlertStatusChip, Drawer, EmptyState, ErrorNote, Field, PageHeader, Pagination, Segmented, SeverityChip } from '../components/ui';
import { TableSkeleton } from '../components/ui/Skeleton';
import { Flame, Gauge, PowerOff, Thermometer } from 'lucide-react';

const typeIcon: Record<string, typeof Flame> = { low_efficiency: Gauge, high_temperature: Thermometer, asset_offline: PowerOff, zero_output: Flame };
const stripColor: Record<string, string> = { critical: 'bg-ember', warning: 'bg-amber', info: 'bg-teal' };

export default function AlertsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'open') as AlertStatus | 'all';
  const severity = (params.get('severity') ?? '') as Severity | '';
  const siteId = params.get('site_id') ?? '';
  const page = Number(params.get('page') ?? 1);
  const [converting, setConverting] = useState<Alert | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const sites = useQuery({ queryKey: ['sites', 'all'], queryFn: () => getPaged<Site>('/sites', { limit: 100, sort: 'name' }) });
  const counts = useQuery({
    queryKey: ['alerts', 'counts'],
    queryFn: async () => {
      const [open, ack, res] = await Promise.all([
        getPaged<Alert>('/alerts', { status: 'open', limit: 1 }),
        getPaged<Alert>('/alerts', { status: 'acknowledged', limit: 1 }),
        getPaged<Alert>('/alerts', { status: 'resolved', limit: 1 }),
      ]);
      return { open: open.meta.total, acknowledged: ack.meta.total, resolved: res.meta.total };
    },
    refetchInterval: 15_000,
  });
  const alerts = useQuery({
    queryKey: ['alerts', { status, severity, siteId, page }],
    queryFn: () => getPaged<Alert>('/alerts', { status: status === 'all' ? undefined : status, severity: severity || undefined, site_id: siteId || undefined, page, limit: 20 }),
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
  });

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['alerts'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); void qc.invalidateQueries({ queryKey: ['sites'] }); };
  const acknowledge = useMutation({ mutationFn: (id: number) => post(`/alerts/${id}/acknowledge`), onSuccess: () => { toast.success('Alert acknowledged.'); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });
  const resolve = useMutation({ mutationFn: (id: number) => post(`/alerts/${id}/resolve`), onSuccess: () => { toast.success('Alert resolved.'); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });

  return (
    <div>
      <PageHeader title="Alerts" description="Raised automatically when an asset crosses a site threshold. Acknowledge to claim it, resolve when fixed, or turn it into a work order." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented ariaLabel="Alert status" value={status} onChange={(v) => setParam('status', v)} options={[{ value: 'open', label: 'Open', count: counts.data?.open }, { value: 'acknowledged', label: 'Acknowledged', count: counts.data?.acknowledged }, { value: 'resolved', label: 'Resolved', count: counts.data?.resolved }, { value: 'all', label: 'All' }]} />
        <select className="field w-auto" value={severity} onChange={(e) => setParam('severity', e.target.value)} aria-label="Filter by severity"><option value="">All severities</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></select>
        <select className="field w-auto" value={siteId} onChange={(e) => setParam('site_id', e.target.value)} aria-label="Filter by site"><option value="">All sites</option>{sites.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>

      <div className="panel overflow-hidden">
        {alerts.isLoading ? <TableSkeleton cols={3} /> : alerts.isError ? <div className="p-5"><ErrorNote message={errorMessage(alerts.error)} /></div> : alerts.data!.data.length === 0 ? <EmptyState title={status === 'open' ? 'No open alerts' : 'Nothing here'} hint={status === 'open' ? 'Every asset is inside its thresholds. New alerts appear here within seconds.' : 'Try another status or clear the filters.'} /> : (
          <ul className="divide-y divide-line">
            {alerts.data!.data.map((a) => (
              <li key={a.id} className="relative grid gap-3 py-4 pl-6 pr-5 md:grid-cols-[auto_1fr_auto] md:items-center">
                <span className={`absolute inset-y-0 left-0 w-1 ${stripColor[a.severity]}`} aria-hidden />
                <div className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-control ${a.severity === 'critical' ? 'bg-ember-soft text-ember' : a.severity === 'warning' ? 'bg-[#fdf0d5] text-[#8a5a00]' : 'bg-teal-soft text-teal'}`}>{(() => { const I = typeIcon[a.type] ?? Flame; return <I className="h-4 w-4" />; })()}</span>
                  <SeverityChip severity={a.severity} /><AlertStatusChip status={a.status} />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] text-ink">{a.message}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-muted">
                    <Link to={`/sites/${a.site_id}`} className="font-medium text-teal hover:underline">{a.site?.name}</Link> · {a.asset?.tag} · {humanize(a.type)} · raised {fmtAgo(a.created_at)}
                    {a.acknowledged_by && <> · acknowledged by {a.acknowledged_by.name}</>}
                    {a.resolved_at && <> · resolved {fmtDateTime(a.resolved_at)}</>}
                    {a.work_order_id && <> · <Link to={`/work-orders?q=${encodeURIComponent(a.message.slice(0, 20))}`} className="text-teal hover:underline">work order #{a.work_order_id}</Link></>}
                  </p>
                </div>
                {can('admin', 'engineer') && a.status !== 'resolved' && (
                  <div className="flex flex-wrap gap-1.5 md:justify-end">
                    {a.status === 'open' && <button className="btn btn-secondary btn-sm" onClick={() => acknowledge.mutate(a.id)} disabled={acknowledge.isPending}>Acknowledge</button>}
                    {!a.work_order_id && <button className="btn btn-secondary btn-sm" onClick={() => setConverting(a)}>Create work order</button>}
                    <button className="btn btn-primary btn-sm" onClick={() => resolve.mutate(a.id)} disabled={resolve.isPending}>Resolve</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {alerts.data && <div className="mt-3"><Pagination page={alerts.data.meta.page} pages={alerts.data.meta.pages} total={alerts.data.meta.total} onChange={(p) => setParam('page', String(p))} /></div>}

      <ConvertDrawer alert={converting} onClose={() => setConverting(null)} />
    </div>
  );
}

function ConvertDrawer({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('high');
  const [dueAt, setDueAt] = useState('');
  const convert = useMutation({
    mutationFn: () => post<WorkOrder>(`/alerts/${alert!.id}/work-order`, { title: title || undefined, priority, due_at: dueAt || undefined }),
    onSuccess: (wo) => { toast.success(`Work order "${wo.title}" created.`); void qc.invalidateQueries({ queryKey: ['alerts'] }); void qc.invalidateQueries({ queryKey: ['work-orders'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!alert) return null;
  return (
    <Drawer open onClose={onClose} title="Create work order from alert" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => convert.mutate()} disabled={convert.isPending}>{convert.isPending ? 'Creating…' : 'Create work order'}</button></>}>
      <div className="mb-5 rounded-control border border-line bg-mist p-4 text-[13.5px]">
        <div className="mb-1 flex gap-2"><SeverityChip severity={alert.severity} /><span className="text-ink-muted">{alert.site?.name} · {alert.asset?.tag}</span></div>
        {alert.message}
      </div>
      <div className="space-y-4">
        <Field label="Title" hint="Leave empty to use a generated title."><input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Investigate ${humanize(alert.type).toLowerCase()} on ${alert.asset?.name}`} /></Field>
        <Field label="Priority"><select className="field" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
        <Field label="Due date"><input className="field" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
      </div>
    </Drawer>
  );
}
