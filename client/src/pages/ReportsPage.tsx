import { useState } from 'react';
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
  const [from, setFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [groupBy, setGroupBy] = useState<'site' | 'type' | 'day'>('site');
  const [downloading, setDownloading] = useState(false);

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
        <Field label="From"><input className="field w-auto" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="field w-auto" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="pb-0.5"><Segmented ariaLabel="Group by" value={groupBy} onChange={setGroupBy} options={[{ value: 'site', label: 'By site' }, { value: 'type', label: 'By technology' }, { value: 'day', label: 'By day' }]} /></div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="panel p-5"><p className="text-[13px] text-ink-muted">Total energy</p><p className="mt-1 font-display text-[30px] font-semibold leading-none text-pine tabular">{fmtKwh(total)}</p><p className="mt-2 text-[12.5px] text-ink-faint">{days} {days === 1 ? 'day' : 'days'} selected</p></div>
        <div className="panel p-5"><p className="text-[13px] text-ink-muted">Average per day</p><p className="mt-1 font-display text-[30px] font-semibold leading-none text-pine tabular">{fmtKwh(total / days)}</p><p className="mt-2 text-[12.5px] text-ink-faint">across the whole fleet</p></div>
        <div className="panel p-5"><p className="text-[13px] text-ink-muted">{groupBy === 'day' ? 'Best day' : groupBy === 'type' ? 'Leading technology' : 'Top plant'}</p><p className="mt-1 truncate font-display text-[24px] font-semibold leading-tight text-pine">{best ? (groupBy === 'type' ? humanize(best.label) : best.label) : '—'}</p><p className="mt-2 text-[12.5px] text-ink-faint">{best ? `${fmtKwh(best.kwh)} · ${total ? ((best.kwh / total) * 100).toFixed(0) : 0}% of total` : 'no data'}</p></div>
      </div>

      <Panel title={`Energy ${from} to ${to}`} action={<span className="text-[13px] text-ink-muted">Total <span className="font-semibold text-pine tabular">{fmtKwh(total)}</span></span>}>
        {energy.isLoading ? <Spinner /> : energy.isError ? <ErrorNote message={errorMessage(energy.error)} /> : !energy.data?.length ? <EmptyState title="No energy in this range" hint="Telemetry is kept for seven days. Pick a more recent range." /> : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(220, 36 * energy.data.length + 40)}>
              <BarChart data={energy.data} layout="vertical" margin={{ left: 8, right: 32 }}>
                <CartesianGrid horizontal={false} stroke="rgba(20,49,43,0.08)" />
                <XAxis type="number" tickFormatter={(v: number) => fmtKwh(v, 0)} tick={{ fontSize: 11.5, fill: '#5C6B66' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={groupBy === 'site' ? 180 : 90} tickFormatter={(v: string) => (groupBy === 'type' ? humanize(v) : v)} tick={{ fontSize: 12.5, fill: '#182320' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(220,232,217,.4)' }} contentStyle={{ borderRadius: 8, border: '1px solid rgba(20,49,43,0.12)', boxShadow: 'none', fontSize: 13 }} formatter={(v: number) => [fmtKwh(v, 1), 'Energy']} />
                <Bar dataKey="kwh" radius={[0, 6, 6, 0]} barSize={18} isAnimationActive={false}>
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
