import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtKw, fmtDate } from '../../lib/format';

export interface TypePoint { ts: string; solar: number; wind: number; hydro: number }

const SERIES: { key: keyof Omit<TypePoint, 'ts'>; label: string; color: string }[] = [
  { key: 'hydro', label: 'Hydro', color: '#1F6F6F' },
  { key: 'wind', label: 'Wind', color: '#2E8B8B' },
  { key: 'solar', label: 'Solar', color: '#F2A93B' },
];

/** 24 hours of fleet output stacked by technology. Solar rises and sets; wind and hydro carry the night. */
export default function TechnologyAreaChart({ data, height = 260 }: { data: TypePoint[]; height?: number }) {
  const points = data.map((d) => ({ ...d, t: new Date(d.ts).getTime() }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.12} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(20,49,43,0.08)" />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => fmtDate(new Date(v).toISOString(), 'HH:mm')} tick={{ fontSize: 11.5, fill: '#5C6B66' }} axisLine={false} tickLine={false} minTickGap={48} />
        <YAxis tickFormatter={(v: number) => (v === 0 ? '0' : fmtKw(v, 0))} tick={{ fontSize: 11.5, fill: '#5C6B66' }} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid rgba(20,49,43,0.12)', boxShadow: 'none', fontSize: 13 }}
          labelFormatter={(v) => fmtDate(new Date(Number(v)).toISOString(), 'd MMM, HH:mm')}
          formatter={(v: number, name: string) => [fmtKw(v, 1), name]}
          itemSorter={(item) => -(item.value as number)}
        />
        <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12.5, paddingBottom: 8 }} />
        {SERIES.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId="fleet" stroke={s.color} strokeWidth={1.5} fill={`url(#fill-${s.key})`} dot={false} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
