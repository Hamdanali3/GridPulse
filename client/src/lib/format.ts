import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

export function fmtKw(kw: number | null | undefined, digits = 1): string {
  if (kw === null || kw === undefined || Number.isNaN(kw)) return '—';
  if (Math.abs(kw) >= 1000) return `${(kw / 1000).toFixed(digits)} MW`;
  return `${kw.toFixed(0)} kW`;
}

export function fmtKwh(kwh: number | null | undefined, digits = 1): string {
  if (kwh === null || kwh === undefined || Number.isNaN(kwh)) return '—';
  if (Math.abs(kwh) >= 1_000_000) return `${(kwh / 1_000_000).toFixed(digits)} GWh`;
  if (Math.abs(kwh) >= 1000) return `${(kwh / 1000).toFixed(digits)} MWh`;
  return `${kwh.toFixed(0)} kWh`;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

export function fmtNumber(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

export function fmtDate(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  return isValid(d) ? format(d, pattern) : '—';
}

export function fmtDateTime(iso: string | null | undefined): string {
  return fmtDate(iso, 'd MMM yyyy, HH:mm');
}

export function fmtTime(iso: string | null | undefined): string {
  return fmtDate(iso, 'HH:mm');
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  return isValid(d) ? `${formatDistanceToNowStrict(d)} ago` : '—';
}

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanize(value: string): string {
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'yyyy-MM-dd') : '';
}

/** Human label for an asset kind. Hydro plants use "transformer" for their turbine-generator sets. */
export function kindLabel(kind: string): string {
  return { inverter: 'Inverter', turbine: 'Wind turbine', panel_string: 'Panel string', transformer: 'Turbine-generator' }[kind] ?? humanize(kind);
}
