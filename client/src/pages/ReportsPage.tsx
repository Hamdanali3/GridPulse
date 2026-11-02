import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { api, errorMessage, get } from '../lib/api';
import { fmtKwh, humanize } from '../lib/format';
import type { EnergyRow } from '../lib/types';
import { EmptyState, ErrorNote, Field, PageHeader, Panel, Segmented, Spinner } from '../components/ui';

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const defaultFrom = format(subDays(new Date(), 7), 'yyyy-MM-dd');
  const defaultTo = format(new Date(), 'yyyy-MM-dd');
  const from = params.get('from') || defaultFrom;
  const to = params.get('to') || defaultTo;
  const rawGroup = params.get('group_by');
  const groupBy: 'site' | 'type' | 'day' = rawGroup === 'type' || rawGroup === 'day' || rawGroup === 'site' ? rawGroup : 'site';
  const [downloading, setDownloading] = useState(false);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const energy = useQuery({ queryKey: ['energy', { from, to, groupBy }], queryFn: () => get<EnergyRow[]>('/telemetry/energy', { from, to: `${to}T23:59:59`, group_by: groupBy }) });
  const total = energy.data?.reduce((a, r) => a + r.kwh, 0) ?? 0;
  const best = energy.data?.reduce<EnergyRow | null>((b, r) => (!b || r.kwh > b.kwh ? r : b), null) ?? null;
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/reports/energy.csv', { params: { from, to: `${to}T23:59:59` }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `gridpulse-energy-${from}-to-${to}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded.');
    } catch (e) { toast.error(errorMessage(e)); } finally { setDownloading(false); }
  };

  return (
    <div>
      <PageHeader title="Reports" description="Energy produced over a date range, grouped the way you need it. Export the daily breakdown as CSV." actions={<button className="btn btn-secondary" onClick={download} disabled={downloading}><Download className="h-4 w-4" /> {downloading ? 'Preparing…' : 'Download CSV'}</button>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From"><input className="field w-auto" type="date" value={from} max={to} onChange={(e) => setParam('from', e.target.value)} /></Field>
        <Field label="To"><input className="field w-auto" type="date" value={to} min={from} onChange={(e) => setParam('to', e.target.value)} /></Field>
        <div className="pb-0.5"><Segmented ariaLabel="Group by" value={groupBy} onChange={(v) => setParam('group_by', v)} options={[{ value: 'site', label: 'By site' }, { value: 'type', label: 'By technology' }, { value: 'day', label: 'By day' }]} /></div>
      </div>

      <div className="panel mb-4 grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5"><p className="text-[12.5px] text-ink-muted">Total energy</p><p className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.025em] text-pine tabular">{fmtKwh(total)}</p><p className="mt-2 text-[12px] text-ink-faint">{days} {days === 1 ? 'day' : 'days'} selected</p></div>
        <div className="p-5"><p className="text-[12.5px] text-ink-muted">Average per day</p><p className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.025em] text-pine tabular">{fmtKwh(total / days)}</p><p className="mt-2 text-[12px] text-ink-faint">across the whole fleet</p></div>
        <div className="p-5"><p className="text-[12.5px] text-ink-muted">{groupBy === 'day' ? 'Best day' : groupBy === 'type' ? 'Leading technology' : 'Top plant'}</p><p className="mt-1 truncate text-[22px] font-semibold leading-tight tracking-[-0.02em] text-pine">{best ? (groupBy === 'type' ? humanize(best.label) : best.label) : '—'}</p><p className="mt-2 text-[12px] text-ink-faint">{best ? `${fmtKwh(best.kwh)} · ${total ? ((best.kwh / total) * 100).toFixed(0) : 0}% of total` : 'no data'}</p></div>
      </div>

      <Panel title={`Energy ${from} to ${to}`} action={<span className="text-[13px] text-ink-muted">Total <span className="font-semibold text-pine tabular">{fmtKwh(total)}</span></span>}>
        {energy.isLoading ? <Spinner /> : energy.isError ? <ErrorNote message={errorMessage(energy.error)} /> : !energy.data?.length ? <EmptyState title="No energy in this range" hint="Telemetry is kept for seven days. Pick a more recent range." /> : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(220, 36 * energy.data.length + 40)}>
              <BarChart data={energy.data} layout="vertical" margin={{ left: 8, right: 32 }}>
                <CartesianGrid horizontal={false} stroke="var(--gp-border)" />
                <XAxis type="number" tickFormatter={(v: number) => fmtKwh(v, 0)} tick={{ fontSize: 11.5, fill: 'var(--gp-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={groupBy === 'site' ? 180 : 90} tickFormatter={(v: string) => (groupBy === 'type' ? humanize(v) : v)} tick={{ fontSize: 12.5, fill: 'var(--gp-text)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--gp-table-hover)' }} contentStyle={{ borderRadius: 'var(--radius-ui)', border: '1px solid var(--gp-border-strong)', boxShadow: 'none', fontSize: 13, background: 'var(--gp-panel)', color: 'var(--gp-text)' }} formatter={(v: number) => [fmtKwh(v, 1), 'Energy']} />
                <Bar dataKey="kwh" radius={[0, 2, 2, 0]} barSize={14} isAnimationActive={false}>
                  {energy.data.map((r) => <Cell key={r.key} fill={r.type === 'solar' || r.key === 'solar' ? '#F2A93B' : groupBy === 'day' ? '#F2A93B' : '#2E8B8B'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <table className="table mt-4">
              <thead><tr><th>{groupBy === 'site' ? 'Site' : groupBy === 'type' ? 'Technology' : 'Day'}</th>{groupBy === 'site' && <th>Code</th>}<th className="text-right">Energy</th><th className="text-right">Share</th></tr></thead>
              <tbody>{energy.data.map((r) => (
                <tr key={r.key}><td className="font-medium text-pine">{groupBy === 'type' ? humanize(r.label) : r.label}</td>{groupBy === 'site' && <td className="tabular text-ink-muted">{r.code}</td>}<td className="text-right tabular">{fmtKwh(r.kwh)}</td><td className="text-right tabular text-ink-muted">{total ? ((r.kwh / total) * 100).toFixed(1) : '0.0'}%</td></tr>
              ))}</tbody>
            </table>
          </>
        )}
      </Panel>
    </div>
  );
}
