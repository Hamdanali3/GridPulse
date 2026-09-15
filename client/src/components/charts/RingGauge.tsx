/**
 * A quiet radial gauge for a single percentage. Amber for generated energy, teal for structure.
 * Pure SVG so it renders identically everywhere and costs nothing.
 */
export default function RingGauge({ value, label, size = 120, stroke = 10, color = '#F2A93B', track = '#DCE8D9', sublabel, dark = false }: { value: number; label: string; size?: number; stroke?: number; color?: string; track?: string; sublabel?: string; dark?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${label} ${pct.toFixed(1)} percent`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 600ms ease' }} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="font-display" fontSize={size / 4.6} fontWeight={700} fill={dark ? '#ffffff' : '#14312B'}>{pct.toFixed(0)}%</text>
      </svg>
      <p className={`mt-1 text-[12.5px] font-medium ${dark ? 'text-white' : 'text-pine'}`}>{label}</p>
      {sublabel && <p className={`text-[11.5px] ${dark ? 'text-white/45' : 'text-ink-faint'}`}>{sublabel}</p>}
    </div>
  );
}
