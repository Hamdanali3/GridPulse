// Server-side JSON response contract validator & normalizer (Section 6 & Section 8).

import { DeepLink, PUBLIC_ALLOWED_ROUTES, sanitizeModelLink, UserRole } from './navigation.ts';

export interface AssistantKpi {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat' | 'neutral';
}

export interface ChartSeriesItem {
  key: string;
  label: string;
  color?: string;
}

export interface ChartVisual {
  type: 'bar' | 'line' | 'area' | 'stacked_bar' | 'pie' | 'progress';
  title: string;
  x: string;
  series: ChartSeriesItem[];
  data: Array<Record<string, string | number | null>>;
  unit?: string;
}

export interface TableVisual {
  type: 'table';
  columns: string[];
  rows: Array<Array<string | number>>;
  caption: string;
}

export type AssistantVisual = ChartVisual | TableVisual;

export interface SessionAssistantResponse {
  summary: string;
  kpis: AssistantKpi[];
  visuals: AssistantVisual[];
  insights: string[];
  links: DeepLink[];
  followups: string[];
  confidence_notes?: string;
}

export interface PublicAssistantResponse {
  summary: string;
  bullets: string[];
  links: DeepLink[];
  followups: string[];
  refused?: boolean;
}

const CHART_TYPES = new Set(['bar', 'line', 'area', 'stacked_bar', 'pie', 'progress']);
const TRENDS = new Set(['up', 'down', 'flat', 'neutral']);

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function validateSessionResponse(
  rawText: string,
  role: UserRole,
  fallbackLinks: DeepLink[],
  hasRecords: boolean,
  validSiteIds?: Set<number>,
): { valid: true; data: SessionAssistantResponse } | { valid: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch {
    return { valid: false, reason: 'Output was not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, reason: 'Root output must be a JSON object.' };
  }

  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (summary.length < 12) {
    return { valid: false, reason: 'Field `summary` is missing or too short.' };
  }

  if (obj.kpis !== undefined && !Array.isArray(obj.kpis)) {
    return { valid: false, reason: 'Field `kpis` must be an array.' };
  }
  if (obj.visuals !== undefined && !Array.isArray(obj.visuals)) {
    return { valid: false, reason: 'Field `visuals` must be an array.' };
  }
  if (obj.insights !== undefined && !Array.isArray(obj.insights)) {
    return { valid: false, reason: 'Field `insights` must be an array.' };
  }
  if (obj.links !== undefined && !Array.isArray(obj.links)) {
    return { valid: false, reason: 'Field `links` must be an array.' };
  }
  if (obj.followups !== undefined && !Array.isArray(obj.followups)) {
    return { valid: false, reason: 'Field `followups` must be an array.' };
  }

  // Normalize KPIs (max 6)
  const kpis: AssistantKpi[] = [];
  for (const item of (obj.kpis as unknown[]) ?? []) {
    if (!item || typeof item !== 'object') continue;
    const k = item as Record<string, unknown>;
    const label = typeof k.label === 'string' ? k.label.trim() : '';
    const val = k.value;
    if (!label || (typeof val !== 'string' && typeof val !== 'number')) continue;
    const trendRaw = typeof k.trend === 'string' ? k.trend.toLowerCase().trim() : '';
    kpis.push({
      label: label.slice(0, 64),
      value: typeof val === 'number' ? Math.round(val * 100) / 100 : val.trim().slice(0, 48),
      ...(typeof k.unit === 'string' && k.unit.trim() ? { unit: k.unit.trim().slice(0, 16) } : {}),
      ...(typeof k.delta === 'string' && k.delta.trim() ? { delta: k.delta.trim().slice(0, 32) } : {}),
      ...(TRENDS.has(trendRaw) ? { trend: trendRaw as AssistantKpi['trend'] } : {}),
    });
    if (kpis.length >= 6) break;
  }

  // Normalize Visuals (max 4)
  const visuals: AssistantVisual[] = [];
  for (const rawVis of (obj.visuals as unknown[]) ?? []) {
    if (!rawVis || typeof rawVis !== 'object') {
      return { valid: false, reason: 'Every item in `visuals` must be an object.' };
    }
    const v = rawVis as Record<string, unknown>;
    const vType = typeof v.type === 'string' ? v.type.toLowerCase().trim() : '';

    if (vType === 'table') {
      if (!Array.isArray(v.columns) || !Array.isArray(v.rows)) {
        return { valid: false, reason: 'Table visual requires `columns` and `rows` arrays.' };
      }
      const colDefs: Array<{ key: string; label: string }> = v.columns
        .map((c) => {
          if (typeof c === 'string') return { key: c, label: c };
          if (c && typeof c === 'object') {
            const co = c as Record<string, unknown>;
            const key = String(co.key ?? co.label ?? '').trim();
            const label = String(co.label ?? co.key ?? '').trim();
            return key ? { key, label: label || key } : null;
          }
          return null;
        })
        .filter((x): x is { key: string; label: string } => Boolean(x));

      if (colDefs.length === 0) continue;

      const rows: Array<Array<string | number>> = [];
      for (const r of v.rows.slice(0, 10)) {
        if (Array.isArray(r)) {
          rows.push(
            colDefs.map((_, idx) => {
              const cell = r[idx];
              if (typeof cell === 'number') return Math.round(cell * 100) / 100;
              if (cell === null || cell === undefined) return '—';
              return String(cell).slice(0, 120);
            }),
          );
        } else if (r && typeof r === 'object') {
          const ro = r as Record<string, unknown>;
          rows.push(
            colDefs.map((cd) => {
              const cell = ro[cd.key] ?? ro[cd.label];
              if (typeof cell === 'number') return Math.round(cell * 100) / 100;
              if (cell === null || cell === undefined) return '—';
              return String(cell).slice(0, 120);
            }),
          );
        }
      }

      if (rows.length > 0) {
        visuals.push({
          type: 'table',
          columns: colDefs.map((c) => c.label),
          rows,
          caption: typeof v.caption === 'string' && v.caption.trim()
            ? v.caption.trim().slice(0, 120)
            : typeof v.title === 'string' && v.title.trim()
            ? v.title.trim().slice(0, 120)
            : 'Summary table',
        });
      }
    } else if (CHART_TYPES.has(vType)) {
      if (!Array.isArray(v.data)) {
        return { valid: false, reason: `Chart visual "${vType}" requires a \`data\` array.` };
      }
      const xKey = typeof v.x === 'string' && v.x.trim() ? v.x.trim() : 'name';
      const rawSeries = Array.isArray(v.series) ? v.series : [];
      const series: ChartSeriesItem[] = rawSeries
        .map((s) => {
          if (typeof s === 'string' && s.trim()) {
            return { key: s.trim(), label: humanizeKey(s.trim()) };
          }
          if (s && typeof s === 'object') {
            const so = s as Record<string, unknown>;
            const key = String(so.key ?? so.dataKey ?? so.name ?? '').trim();
            if (!key) return null;
            const label = String(so.label ?? so.name ?? humanizeKey(key)).trim();
            const color = typeof so.color === 'string' && so.color.trim() ? so.color.trim() : undefined;
            return { key, label, ...(color ? { color } : {}) };
          }
          return null;
        })
        .filter((x): x is ChartSeriesItem => Boolean(x));

      const dataRows: Array<Record<string, string | number | null>> = [];
      for (const item of v.data.slice(0, 36)) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const rec: Record<string, string | number | null> = {};
        for (const [dk, dv] of Object.entries(item as Record<string, unknown>)) {
          if (typeof dv === 'number') {
            rec[dk] = Number.isFinite(dv) ? Math.round(dv * 100) / 100 : 0;
          } else if (typeof dv === 'string') {
            const num = Number(dv);
            if (dk !== xKey && dv.trim() !== '' && Number.isFinite(num)) {
              rec[dk] = Math.round(num * 100) / 100;
            } else {
              rec[dk] = dv.slice(0, 80);
            }
          } else if (dv === null) {
            rec[dk] = null;
          }
        }
        dataRows.push(rec);
      }

      // Infer series keys from data if series array was omitted
      if (series.length === 0 && dataRows.length > 0) {
        for (const [dk, dv] of Object.entries(dataRows[0])) {
          if (dk !== xKey && typeof dv === 'number') {
            series.push({ key: dk, label: humanizeKey(dk) });
          }
        }
      }

      if (dataRows.length > 0 && series.length > 0) {
        visuals.push({
          type: vType as ChartVisual['type'],
          title: typeof v.title === 'string' && v.title.trim() ? v.title.trim().slice(0, 100) : 'Operational chart',
          x: xKey,
          series: series.slice(0, 6),
          data: dataRows,
          ...(typeof v.unit === 'string' && v.unit.trim() ? { unit: v.unit.trim().slice(0, 16) } : {}),
        });
      }
    } else {
      return { valid: false, reason: `Unsupported visual type "${vType}".` };
    }

    if (visuals.length >= 4) break;
  }

  // Normalize Insights (1-3)
  const insights: string[] = [];
  for (const ins of (obj.insights as unknown[]) ?? []) {
    if (typeof ins === 'string' && ins.trim()) {
      insights.push(ins.trim().slice(0, 220));
    }
    if (insights.length >= 3) break;
  }

  // Validate Links strictly against router whitelist + role
  const links: DeepLink[] = [];
  const seenHref = new Set<string>();
  const rawLinks = (obj.links as unknown[]) ?? [];
  for (const rl of rawLinks) {
    if (rl && typeof rl === 'object') {
      const rRoute = String((rl as Record<string, unknown>).route ?? '').trim();
      // If the LLM hallucinated an unknown route (not starting with a valid prefix), trigger retry!
      if (
        rRoute &&
        !rRoute.startsWith('/sites') &&
        ![
          '/',
          '/assets',
          '/alerts',
          '/work-orders',
          '/reports',
          '/team',
          '/audit',
          '/settings',
        ].includes(rRoute.split('?')[0])
      ) {
        return { valid: false, reason: `Invented non-whitelisted route "${rRoute}".` };
      }
    }
    const clean = sanitizeModelLink(rl, role, validSiteIds);
    if (clean) {
      const key = `${clean.route}?${new URLSearchParams(clean.query ?? {}).toString()}`;
      if (!seenHref.has(key)) {
        seenHref.add(key);
        links.push(clean);
      }
    }
    if (links.length >= 4) break;
  }

  // Ensure at least one verified deep link whenever records exist
  if (links.length === 0 && (hasRecords || fallbackLinks.length > 0)) {
    for (const fb of fallbackLinks) {
      const key = `${fb.route}?${new URLSearchParams(fb.query ?? {}).toString()}`;
      if (!seenHref.has(key)) {
        seenHref.add(key);
        links.push(fb);
      }
      if (links.length >= 2) break;
    }
    if (links.length === 0) {
      links.push({ label: 'Open Fleet Overview', route: '/' });
    }
  }

  // Followups (3 role-appropriate next questions)
  const followups: string[] = [];
  for (const f of (obj.followups as unknown[]) ?? []) {
    if (typeof f === 'string' && f.trim()) {
      followups.push(f.trim().slice(0, 120));
    }
    if (followups.length >= 3) break;
  }
  const defaultFollowups: Record<UserRole, string[]> = {
    admin: [
      'Show overdue work orders across all sites',
      'Summarize open critical alerts right now',
      'Show 7-day energy report grouped by technology',
    ],
    engineer: [
      'Which of my assigned work orders are due soonest?',
      'Show open critical and warning alerts across sites',
      'Which units have the lowest health score right now?',
    ],
    viewer: [
      'What is current fleet output and capacity factor?',
      'Compare 7-day energy generation by technology',
      'What does capacity factor mean in GridPulse?',
    ],
  };
  for (const df of defaultFollowups[role]) {
    if (followups.length >= 3) break;
    if (!followups.includes(df)) followups.push(df);
  }

  const confidenceNotes =
    typeof obj.confidence_notes === 'string' && obj.confidence_notes.trim()
      ? obj.confidence_notes.trim().slice(0, 260)
      : undefined;

  return {
    valid: true,
    data: {
      summary,
      kpis,
      visuals,
      insights: insights.length > 0 ? insights : ['All metrics reflect verified GridPulse operational records in Asia/Karachi time.'],
      links,
      followups: followups.slice(0, 3),
      ...(confidenceNotes ? { confidence_notes: confidenceNotes } : {}),
    },
  };
}

export function validatePublicResponse(
  rawText: string,
): { valid: true; data: PublicAssistantResponse } | { valid: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch {
    return { valid: false, reason: 'Public output was not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, reason: 'Public root output must be a JSON object.' };
  }

  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (summary.length < 10) {
    return { valid: false, reason: 'Field `summary` is missing or too short.' };
  }

  const bullets: string[] = [];
  if (Array.isArray(obj.bullets)) {
    for (const b of obj.bullets) {
      if (typeof b === 'string' && b.trim()) bullets.push(b.trim().slice(0, 200));
      if (bullets.length >= 4) break;
    }
  }

  const links: DeepLink[] = [];
  if (Array.isArray(obj.links)) {
    for (const l of obj.links) {
      if (!l || typeof l !== 'object') continue;
      const lo = l as Record<string, unknown>;
      const route = typeof lo.route === 'string' ? lo.route.trim() : '';
      const label = typeof lo.label === 'string' && lo.label.trim() ? lo.label.trim().slice(0, 60) : 'Explore GridPulse';
      if (PUBLIC_ALLOWED_ROUTES.has(route)) {
        links.push({ label, route });
      }
      if (links.length >= 3) break;
    }
  }
  if (links.length === 0) {
    links.push({ label: 'Try Demo Sign In', route: '/login' });
  }

  const followups: string[] = [];
  if (Array.isArray(obj.followups)) {
    for (const f of obj.followups) {
      if (typeof f === 'string' && f.trim()) followups.push(f.trim().slice(0, 110));
      if (followups.length >= 3) break;
    }
  }
  const defaults = [
    'How do alerts become work orders?',
    'What can Admin, Engineer, and Viewer roles do?',
    'How can I try the live demo?',
  ];
  for (const d of defaults) {
    if (followups.length >= 3) break;
    if (!followups.includes(d)) followups.push(d);
  }

  return {
    valid: true,
    data: {
      summary,
      bullets,
      links,
      followups: followups.slice(0, 3),
      ...(typeof obj.refused === 'boolean' ? { refused: obj.refused } : {}),
    },
  };
}
