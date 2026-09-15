import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS: Record<string, string> = { critical: '#E5533C', warning: '#F2A93B', info: '#2E8B8B' };

export default function SeverityDonut({ bySeverity, size = 88 }: { bySeverity: Record<string, number>; size?: number }) {
  const data = ['critical', 'warning', 'info'].map((k) => ({ name: k, value: bySeverity[k] ?? 0 })).filter((d) => d.value > 0);
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) return null;
  return (
    <div style={{ width: size, height: size }} className="relative shrink-0" aria-label={`${total} open alerts by severity`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={size * 0.33} outerRadius={size * 0.48} paddingAngle={3} stroke="none" isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={COLORS[d.name]} />)}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid rgba(20,49,43,0.12)', boxShadow: 'none', fontSize: 12.5 }} formatter={(v: number, n: string) => [v, n]} />
        </PieChart>
      </ResponsiveContainer>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-[18px] font-bold text-pine tabular">{total}</span>
    </div>
  );
}
