import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import type { AssistantKpi, AssistantVisual, ChartVisual, TableVisual } from '../../lib/assistant';

const PALETTE = [
  '#1F6F6F', // Pine teal
  '#F2A93B', // Warm amber
  '#2E8B8B', // River teal
  '#C63B25', // Ember
  '#5A7D73', // Sage
  '#8A5200', // Deep ochre
];

function formatCompactValue(v: unknown, unit?: string): string {
  if (typeof v === 'number') {
    const formatted = Number.isInteger(v)
      ? v.toLocaleString()
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return unit ? `${formatted} ${unit}` : formatted;
  }
  if (v === null || v === undefined) return '—';
  return String(v);
}

function formatXAxisTick(v: unknown): string {
  const s = String(v ?? '');
  // Shorten ISO timestamps if present
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Karachi',
      });
    }
  }
  return s.length > 16 ? `${s.slice(0, 15)}…` : s;
}

export function KpiGrid({ kpis }: { kpis: AssistantKpi[] }) {
  if (!Array.isArray(kpis) || !kpis.length) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {kpis.map((k, idx) => (
        <div
          key={`${k.label}-${idx}`}
          className="rounded-control border border-line bg-mist px-3 py-2.5"
        >
          <p className="truncate text-[11px] font-medium text-ink-faint" title={k.label}>
            {k.label}
          </p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="tabular text-[17px] font-semibold leading-tight tracking-[-0.02em] text-pine">
              {typeof k.value === 'number'
                ? k.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : k.value}
            </span>
            {k.unit && <span className="text-[11.5px] text-ink-muted">{k.unit}</span>}
          </div>
          {k.delta && (
            <div
              className={clsx(
                'mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium',
                k.trend === 'up'
                  ? 'text-teal'
                  : k.trend === 'down'
                  ? 'text-ember'
                  : 'text-ink-faint',
              )}
            >
              {k.trend === 'up' && <ArrowUpRight className="h-3 w-3" />}
              {k.trend === 'down' && <ArrowDownRight className="h-3 w-3" />}
              {(k.trend === 'flat' || k.trend === 'neutral') && <Minus className="h-3 w-3" />}
              <span>{k.delta}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ProgressVisual({ visual }: { visual: ChartVisual }) {
  const series = Array.isArray(visual.series) ? visual.series : [];
  const data = Array.isArray(visual.data) ? visual.data : [];
  const key = series[0]?.key ?? 'value';
  return (
    <div className="rounded-control border border-line bg-paper p-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-medium text-pine">{visual.title}</p>
        {visual.unit && <span className="text-[11px] text-ink-faint">{visual.unit}</span>}
      </div>
      <div className="space-y-2.5">
        {data.slice(0, 6).map((row, idx) => {
          const label = String(row[visual.x] ?? row.label ?? row.name ?? series[0]?.label ?? 'Progress');
          const rawVal = Number(row[key] ?? row.value ?? 0);
          const pct = Math.max(0, Math.min(100, Number.isFinite(rawVal) ? rawVal : 0));
          return (
            <div key={`${label}-${idx}`}>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="truncate text-ink-muted">{label}</span>
                <span className="tabular font-semibold text-pine">
                  {pct.toFixed(1)}
                  {visual.unit === '%' || !visual.unit ? '%' : ` ${visual.unit}`}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-chip bg-moss-deep">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: series[0]?.color ?? PALETTE[0],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RechartsVisual({ visual }: { visual: ChartVisual }) {
  if (visual.type === 'progress') {
    return <ProgressVisual visual={visual} />;
  }

  const tooltipStyle = {
    borderRadius: 'var(--radius-ui)',
    border: '1px solid var(--gp-border-strong)',
    boxShadow: 'none',
    fontSize: 12,
    background: 'var(--gp-panel)',
    color: 'var(--gp-text)',
  };

  return (
    <div className="rounded-control border border-line bg-paper p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-medium text-pine">{visual.title}</p>
        {visual.unit && <span className="text-[11px] text-ink-faint">Unit: {visual.unit}</span>}
      </div>

      <div className="h-[205px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {visual.type === 'pie' ? (
            <PieChart>
              <Pie
                data={visual.data}
                dataKey={visual.series[0]?.key ?? 'value'}
                nameKey={visual.x}
                innerRadius={42}
                outerRadius={70}
                paddingAngle={2}
                isAnimationActive={false}
              >
                {visual.data.map((_, idx) => (
                  <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val: number, name: string) => [formatCompactValue(val, visual.unit), name]}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11.5, color: 'var(--gp-text-muted)' }} />
            </PieChart>
          ) : visual.type === 'line' ? (
            <LineChart data={visual.data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--gp-border)" />
              <XAxis
                dataKey={visual.x}
                tickFormatter={formatXAxisTick}
                tick={{ fontSize: 11, fill: 'var(--gp-text-muted)' }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--gp-text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val: number, name: string) => [formatCompactValue(val, visual.unit), name]}
              />
              {visual.series.length > 1 && (
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11.5, color: 'var(--gp-text-muted)' }} />
              )}
              {visual.series.map((s, idx) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color ?? PALETTE[idx % PALETTE.length]}
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : visual.type === 'area' ? (
            <AreaChart data={visual.data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--gp-border)" />
              <XAxis
                dataKey={visual.x}
                tickFormatter={formatXAxisTick}
                tick={{ fontSize: 11, fill: 'var(--gp-text-muted)' }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--gp-text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(val: number, name: string) => [formatCompactValue(val, visual.unit), name]}
              />
              {visual.series.length > 1 && (
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11.5, color: 'var(--gp-text-muted)' }} />
              )}
              {visual.series.map((s, idx) => {
                const color = s.color ?? PALETTE[idx % PALETTE.length];
                return (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stackId={visual.series.length > 1 ? 'stack' : undefined}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.2}
                    strokeWidth={1.6}
                    isAnimationActive={false}
                  />
                );
              })}
            </AreaChart>
          ) : (
            <BarChart data={visual.data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--gp-border)" />
              <XAxis
                dataKey={visual.x}
                tickFormatter={formatXAxisTick}
                tick={{ fontSize: 11, fill: 'var(--gp-text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--gp-text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                cursor={{ fill: 'var(--gp-table-hover)' }}
                contentStyle={tooltipStyle}
                formatter={(val: number, name: string) => [formatCompactValue(val, visual.unit), name]}
              />
              {visual.series.length > 1 && (
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11.5, color: 'var(--gp-text-muted)' }} />
              )}
              {visual.series.map((s, idx) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId={visual.type === 'stacked_bar' ? 'stack' : undefined}
                  fill={s.color ?? PALETTE[idx % PALETTE.length]}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TableBlock({ visual }: { visual: TableVisual }) {
  const columns = Array.isArray(visual.columns) ? visual.columns : [];
  const rows = Array.isArray(visual.rows) ? visual.rows : [];
  return (
    <div className="overflow-hidden rounded-control border border-line bg-paper">
      <div className="border-b border-line bg-mist px-3 py-2">
        <p className="text-[12px] font-medium text-pine">{visual.caption}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-line text-[11px] font-medium text-ink-faint">
              {columns.map((col, idx) => (
                <th key={`${col}-${idx}`} className="whitespace-nowrap px-3 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-moss/40">
                {Array.isArray(row) && row.map((cell, cIdx) => {
                  const isNumeric = typeof cell === 'number';
                  return (
                    <td
                      key={cIdx}
                      className={clsx(
                        'whitespace-nowrap px-3 py-1.5 text-ink',
                        isNumeric && 'tabular font-medium',
                      )}
                    >
                      {isNumeric ? cell.toLocaleString(undefined, { maximumFractionDigits: 2 }) : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function normalizeVisual(raw: AssistantVisual): AssistantVisual | null {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.type === 'table') {
    const t = raw as TableVisual;
    const columns = Array.isArray(t.columns) ? t.columns.map(String) : [];
    const rows = Array.isArray(t.rows) ? t.rows.filter(Array.isArray) : [];
    if (columns.length === 0 && rows.length === 0) return null;
    return {
      type: 'table',
      caption: t.caption || 'Operational Summary',
      columns,
      rows,
    };
  }

  const c = raw as unknown as Record<string, unknown>;
  const rawType = String(c.type ?? 'bar').toLowerCase();
  const validTypes = ['bar', 'line', 'area', 'stacked_bar', 'pie', 'progress'];
  const type = (validTypes.includes(rawType) ? rawType : 'bar') as ChartVisual['type'];
  const title = String(c.title ?? 'Telemetry Visual');
  const unit = c.unit ? String(c.unit) : undefined;
  let x = String(c.x ?? c.xAxisKey ?? 'name');

  let data: Array<Record<string, string | number | null>> = [];
  if (Array.isArray(c.data)) {
    data = c.data.filter((d): d is Record<string, string | number | null> => d && typeof d === 'object');
  } else if (c.data && typeof c.data === 'object') {
    data = Object.entries(c.data as Record<string, unknown>).map(([k, v]) => ({
      name: k,
      value: typeof v === 'number' ? v : Number(v) || 0,
    }));
    x = 'name';
  }

  if (data.length === 0) return null;

  let series: Array<{ key: string; label: string; color?: string }> = [];
  if (Array.isArray(c.series) && c.series.length > 0) {
    series = (c.series as Array<{ key?: string; label?: string; color?: string }>)
      .filter((s): s is { key: string; label?: string; color?: string } => Boolean(s && typeof s.key === 'string'))
      .map((s, idx) => ({
        key: s.key,
        label: s.label || s.key,
        color: s.color || PALETTE[idx % PALETTE.length],
      }));
  }

  if (series.length === 0) {
    const sample = data[0] ?? {};
    const candidateKeys = Object.keys(sample).filter(
      (k) => k !== x && typeof sample[k] === 'number',
    );
    if (candidateKeys.length > 0) {
      series = candidateKeys.map((k, idx) => ({
        key: k,
        label: k.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        color: PALETTE[idx % PALETTE.length],
      }));
    } else {
      series = [{ key: 'value', label: 'Value', color: PALETTE[0] }];
    }
  }

  return {
    type,
    title,
    x,
    series,
    data,
    unit,
  };
}

export function AssistantVisualBlock({ visual }: { visual: AssistantVisual }) {
  const norm = normalizeVisual(visual);
  if (!norm) return null;
  if (norm.type === 'table') {
    return <TableBlock visual={norm} />;
  }
  return <RechartsVisual visual={norm} />;
}

