import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtKw, fmtTime } from '../../lib/format';
import type { SeriesPoint } from '../../lib/types';

/**
 * The one memorable element of the product: fleet output over the last hour, redrawn every 5 s.
 * Amber is reserved for generated energy across the whole interface. On the dark hero the line glows.
 */
export default function FleetLiveChart({ data, height = 220, dark = false }: { data: SeriesPoint[]; height?: number; dark?: boolean }) {
  const points = data.map((d) => ({ ...d, t: new Date(d.ts).getTime() }));
  const axis = dark ? 'rgba(255,255,255,0.55)' : '#5C6B66';
  const grid = dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,49,43,0.08)';
  return (
    <div className={dark ? 'hero-chart' : undefined}>
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={dark ? 'fleetFillDark' : 'fleetFill'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2A93B" stopOpacity={dark ? 0.5 : 0.4} />
            <stop offset="100%" stopColor="#F2A93B" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={grid} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => fmtTime(new Date(v).toISOString())} tick={{ fontSize: 11.5, fill: axis }} axisLine={false} tickLine={false} minTickGap={48} />
        <YAxis tickFormatter={(v: number) => (v === 0 ? '0' : fmtKw(v, 0))} tick={{ fontSize: 11.5, fill: axis }} axisLine={false} tickLine={false} width={64} domain={[0, 'auto']} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid rgba(20,49,43,0.12)', boxShadow: 'none', fontSize: 13, background: '#fff', color: '#182320' }}
          labelFormatter={(v) => fmtTime(new Date(Number(v)).toISOString())}
          formatter={(v: number) => [fmtKw(v, 2), 'Fleet output']}
        />
        <Area type="monotone" dataKey="kw" stroke="#F2A93B" strokeWidth={2.4} fill={`url(#${dark ? 'fleetFillDark' : 'fleetFill'})`} isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: '#F2A93B', stroke: '#fff', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
}
