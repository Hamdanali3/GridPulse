import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtKw, fmtDate } from '../../lib/format';
import type { SeriesPoint } from '../../lib/types';

export default function SiteSeriesChart({ data, height = 240, showEfficiency = true }: { data: SeriesPoint[]; height?: number; showEfficiency?: boolean }) {
  const points = data.map((d) => ({ ...d, t: new Date(d.ts).getTime() }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="siteFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2A93B" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#F2A93B" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(20,49,43,0.08)" />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => fmtDate(new Date(v).toISOString(), 'HH:mm')} tick={{ fontSize: 11.5, fill: '#5C6B66' }} axisLine={false} tickLine={false} minTickGap={40} />
        <YAxis yAxisId="kw" tickFormatter={(v: number) => (v === 0 ? '0' : fmtKw(v, 0))} tick={{ fontSize: 11.5, fill: '#5C6B66' }} axisLine={false} tickLine={false} width={64} />
        {showEfficiency && <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11.5, fill: '#5C6B66' }} axisLine={false} tickLine={false} width={44} />}
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid rgba(20,49,43,0.12)', boxShadow: 'none', fontSize: 13 }}
          labelFormatter={(v) => fmtDate(new Date(Number(v)).toISOString(), 'd MMM, HH:mm')}
          formatter={(v: number, name: string) => (name === 'kw' ? [fmtKw(v, 2), 'Output'] : name === 'efficiency_pct' ? [`${v.toFixed(1)}%`, 'Efficiency'] : [`${v.toFixed(1)} °C`, 'Temperature'])}
        />
        <Area yAxisId="kw" type="monotone" dataKey="kw" stroke="#F2A93B" strokeWidth={2} fill="url(#siteFill)" dot={false} isAnimationActive={false} />
        {showEfficiency && <Line yAxisId="pct" type="monotone" dataKey="efficiency_pct" stroke="#2E8B8B" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
