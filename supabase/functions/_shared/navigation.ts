// Verified deep-link router whitelist for GridPulse (`client/src/App.tsx`).
// PulseBot NEVER invents routes; all links come strictly from this whitelist.

export type UserRole = 'admin' | 'engineer' | 'viewer';

export interface DeepLink {
  label: string;
  route: string;
  query?: Record<string, string>;
}

const SITE_TYPES = new Set(['solar', 'wind', 'hydro']);
const OP_STATUSES = new Set(['online', 'degraded', 'offline', 'maintenance']);
const ASSET_KINDS = new Set(['inverter', 'turbine', 'panel_string', 'transformer']);
const ALERT_STATUSES = new Set(['open', 'acknowledged', 'resolved', 'all']);
const SEVERITIES = new Set(['critical', 'warning', 'info']);
const ALERT_TYPES = new Set(['low_efficiency', 'high_temperature', 'asset_offline', 'zero_output']);
const WO_STATUSES = new Set(['planned', 'in_progress', 'blocked', 'done']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const REPORT_GROUPS = new Set(['site', 'type', 'day']);

export const PUBLIC_ALLOWED_ROUTES = new Set([
  '/login',
  '/register',
  '/#platform',
  '/#capabilities',
  '/#about',
  '/#contact',
]);

function cleanDate(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

function cleanPositiveInt(val: unknown): string | undefined {
  if (typeof val === 'number' && Number.isInteger(val) && val > 0) return String(val);
  if (typeof val === 'string' && /^\d+$/.test(val.trim()) && Number(val.trim()) > 0) return val.trim();
  return undefined;
}

export function resolveNavigateTarget(
  intent: string,
  params: Record<string, unknown>,
  role: UserRole,
  validSiteIds?: Set<number>,
): { ok: boolean; forbidden?: boolean; message?: string; link?: DeepLink } {
  const key = (intent || '').toLowerCase().trim();
  const labelOverride = typeof params.label === 'string' && params.label.trim() ? params.label.trim().slice(0, 90) : undefined;

  if ((key === 'team' || key === '/team') && role !== 'admin') {
    return {
      ok: false,
      forbidden: true,
      message: 'Team management requires the Admin role.',
    };
  }
  if ((key === 'audit' || key === 'audit_log' || key === '/audit') && role !== 'admin') {
    return {
      ok: false,
      forbidden: true,
      message: 'The Audit Log requires the Admin role.',
    };
  }

  switch (key) {
    case 'overview':
    case 'dashboard':
    case '/': {
      return {
        ok: true,
        link: { label: labelOverride ?? 'Open Fleet Overview', route: '/' },
      };
    }

    case 'sites':
    case '/sites': {
      const q: Record<string, string> = {};
      if (typeof params.q === 'string' && params.q.trim()) q.q = params.q.trim().slice(0, 60);
      const t = typeof params.type === 'string' ? params.type.toLowerCase().trim() : typeof params.technology === 'string' ? params.technology.toLowerCase().trim() : '';
      if (SITE_TYPES.has(t)) q.type = t;
      const st = typeof params.status === 'string' ? params.status.toLowerCase().trim() : '';
      if (OP_STATUSES.has(st)) q.status = st;
      if (params.view === 'cards' || params.view === 'table') q.view = params.view;

      const parts: string[] = [];
      if (q.type) parts.push(q.type);
      if (q.status) parts.push(q.status);
      const defaultLabel = parts.length ? `Open Sites (${parts.join(', ')})` : 'Open Sites';
      return {
        ok: true,
        link: { label: labelOverride ?? defaultLabel, route: '/sites', ...(Object.keys(q).length ? { query: q } : {}) },
      };
    }

    case 'site_detail':
    case 'site': {
      const siteIdStr = cleanPositiveInt(params.site_id ?? params.id);
      if (!siteIdStr) {
        return resolveNavigateTarget('sites', params, role, validSiteIds);
      }
      const siteId = Number(siteIdStr);
      if (validSiteIds && validSiteIds.size > 0 && !validSiteIds.has(siteId)) {
        return resolveNavigateTarget('sites', params, role, validSiteIds);
      }
      const q: Record<string, string> = {};
      const r = String(params.range ?? '').trim();
      if (r === '24' || r === '24h') q.range = '24';
      else if (r === '72' || r === '3d' || r === '72h') q.range = '72';
      else if (r === '168' || r === '7d' || r === '168h') q.range = '168';

      const siteName = typeof params.site_name === 'string' && params.site_name.trim() ? params.site_name.trim() : `Site #${siteId}`;
      return {
        ok: true,
        link: {
          label: labelOverride ?? `Inspect ${siteName}`,
          route: `/sites/${siteId}`,
          ...(Object.keys(q).length ? { query: q } : {}),
        },
      };
    }

    case 'assets':
    case '/assets': {
      const q: Record<string, string> = {};
      if (typeof params.q === 'string' && params.q.trim()) q.q = params.q.trim().slice(0, 60);
      const siteId = cleanPositiveInt(params.site_id);
      if (siteId) q.site_id = siteId;
      const kind = typeof params.kind === 'string' ? params.kind.toLowerCase().trim() : '';
      if (ASSET_KINDS.has(kind)) q.kind = kind;
      const st = typeof params.status === 'string' ? params.status.toLowerCase().trim() : '';
      if (OP_STATUSES.has(st)) q.status = st;

      return {
        ok: true,
        link: {
          label: labelOverride ?? (q.status ? `Open Assets (${q.status})` : 'Open Assets'),
          route: '/assets',
          ...(Object.keys(q).length ? { query: q } : {}),
        },
      };
    }

    case 'alerts':
    case '/alerts': {
      const q: Record<string, string> = {};
      const st = typeof params.status === 'string' ? params.status.toLowerCase().trim() : '';
      if (ALERT_STATUSES.has(st)) q.status = st;
      const sev = typeof params.severity === 'string' ? params.severity.toLowerCase().trim() : '';
      if (SEVERITIES.has(sev)) q.severity = sev;
      const tp = typeof params.type === 'string' ? params.type.toLowerCase().trim() : '';
      if (ALERT_TYPES.has(tp)) q.type = tp;
      const siteId = cleanPositiveInt(params.site_id);
      if (siteId) q.site_id = siteId;

      const parts: string[] = [];
      if (q.severity) parts.push(q.severity);
      if (q.status) parts.push(q.status);
      const defaultLabel = parts.length ? `Open Alerts (${parts.join(', ')})` : 'Open Alerts';
      return {
        ok: true,
        link: { label: labelOverride ?? defaultLabel, route: '/alerts', ...(Object.keys(q).length ? { query: q } : {}) },
      };
    }

    case 'work_orders':
    case 'work-orders':
    case '/work-orders': {
      const q: Record<string, string> = {};
      if (params.view === 'board' || params.view === 'table') q.view = params.view;
      if (typeof params.q === 'string' && params.q.trim()) q.q = params.q.trim().slice(0, 60);
      const siteId = cleanPositiveInt(params.site_id);
      if (siteId) q.site_id = siteId;
      const assigneeId = cleanPositiveInt(params.assignee_id);
      if (assigneeId) q.assignee_id = assigneeId;
      if (params.mine === true || params.mine === '1' || params.mine === 1) q.mine = '1';
      if (params.overdue === true || params.overdue === '1' || params.overdue === 1) q.overdue = '1';

      const st = typeof params.status === 'string' ? params.status.toLowerCase().trim() : '';
      if (WO_STATUSES.has(st)) q.status = st;
      const pr = typeof params.priority === 'string' ? params.priority.toLowerCase().trim() : '';
      if (PRIORITIES.has(pr)) q.priority = pr;

      // Support single or multiple technologies (`types=hydro,solar`)
      const rawTechs: string[] = [];
      if (Array.isArray(params.technologies)) {
        for (const item of params.technologies) if (typeof item === 'string') rawTechs.push(item.toLowerCase().trim());
      } else if (typeof params.types === 'string') {
        rawTechs.push(...params.types.split(',').map((s) => s.toLowerCase().trim()));
      } else if (typeof params.technology === 'string') {
        rawTechs.push(...params.technology.split(',').map((s) => s.toLowerCase().trim()));
      }
      const validTechs = Array.from(new Set(rawTechs.filter((t) => SITE_TYPES.has(t))));
      if (validTechs.length) q.types = validTechs.join(',');

      const from = cleanDate(params.from);
      const to = cleanDate(params.to);
      if (from) q.from = from;
      if (to) q.to = to;

      // Table view shows date/tech/overdue filters cleanly when filtered
      if (!q.view && (q.from || q.to || q.types || q.overdue || q.status)) {
        q.view = 'table';
      }

      const tags: string[] = [];
      if (q.overdue === '1') tags.push('Overdue');
      if (q.types) tags.push(q.types.split(',').map((t) => t[0].toUpperCase() + t.slice(1)).join(' + '));
      if (q.from && q.to) tags.push(`${q.from} to ${q.to}`);
      else if (q.status) tags.push(q.status.replace('_', ' '));

      const defaultLabel = tags.length ? `Open Work Orders (${tags.join(', ')})` : 'Open Work Orders';
      return {
        ok: true,
        link: {
          label: labelOverride ?? defaultLabel,
          route: '/work-orders',
          ...(Object.keys(q).length ? { query: q } : {}),
        },
      };
    }

    case 'reports':
    case 'energy_report':
    case '/reports': {
      const q: Record<string, string> = {};
      const from = cleanDate(params.from);
      const to = cleanDate(params.to);
      if (from) q.from = from;
      if (to) q.to = to;
      const gb = typeof params.group_by === 'string' ? params.group_by.toLowerCase().trim() : '';
      if (REPORT_GROUPS.has(gb)) q.group_by = gb;

      const defaultLabel = q.group_by ? `Open Energy Reports (by ${q.group_by})` : 'Open Energy Reports';
      return {
        ok: true,
        link: { label: labelOverride ?? defaultLabel, route: '/reports', ...(Object.keys(q).length ? { query: q } : {}) },
      };
    }

    case 'team':
    case '/team': {
      return {
        ok: true,
        link: { label: labelOverride ?? 'Open Team Management', route: '/team' },
      };
    }

    case 'audit':
    case 'audit_log':
    case '/audit': {
      const q: Record<string, string> = {};
      if (typeof params.q === 'string' && params.q.trim()) q.q = params.q.trim().slice(0, 60);
      if (typeof params.action === 'string' && params.action.trim()) q.action = params.action.trim().slice(0, 60);
      const from = cleanDate(params.from);
      if (from) q.from = from;
      return {
        ok: true,
        link: { label: labelOverride ?? 'Open Audit Log', route: '/audit', ...(Object.keys(q).length ? { query: q } : {}) },
      };
    }

    case 'settings':
    case '/settings': {
      return {
        ok: true,
        link: { label: labelOverride ?? 'Open Settings', route: '/settings' },
      };
    }

    default:
      return {
        ok: false,
        message: `Unknown navigation intent "${intent}". Valid intents: overview, sites, site_detail, assets, alerts, work_orders, reports, settings${role === 'admin' ? ', team, audit' : ''}.`,
      };
  }
}

export function sanitizeModelLink(
  raw: unknown,
  role: UserRole,
  validSiteIds?: Set<number>,
): DeepLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawRoute = typeof obj.route === 'string' ? obj.route.trim() : '';
  if (!rawRoute) return null;

  const label = typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim().slice(0, 90) : undefined;

  // Split any inline query string if the model included `?` inside `route`
  let pathname = rawRoute;
  const mergedQuery: Record<string, unknown> = {};
  if (rawRoute.includes('?')) {
    const idx = rawRoute.indexOf('?');
    pathname = rawRoute.slice(0, idx);
    const sp = new URLSearchParams(rawRoute.slice(idx + 1));
    sp.forEach((v, k) => {
      mergedQuery[k] = v;
    });
  }
  if (obj.query && typeof obj.query === 'object' && !Array.isArray(obj.query)) {
    for (const [k, v] of Object.entries(obj.query as Record<string, unknown>)) {
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        mergedQuery[k] = String(v).trim();
      }
    }
  }
  if (label) mergedQuery.label = label;

  // Match `/sites/:id`
  const siteMatch = /^\/sites\/(\d+)$/.exec(pathname);
  if (siteMatch) {
    mergedQuery.site_id = siteMatch[1];
    const resolved = resolveNavigateTarget('site_detail', mergedQuery, role, validSiteIds);
    return resolved.ok && resolved.link ? resolved.link : null;
  }

  const allowedStatic = new Set(['/', '/sites', '/assets', '/alerts', '/work-orders', '/reports', '/team', '/audit', '/settings']);
  if (!allowedStatic.has(pathname)) {
    return null;
  }

  const resolved = resolveNavigateTarget(pathname, mergedQuery, role, validSiteIds);
  return resolved.ok && resolved.link ? resolved.link : null;
}

export function buildLinkHref(link: DeepLink): string {
  if (!link.query || Object.keys(link.query).length === 0) return link.route;
  const sp = new URLSearchParams(link.query);
  const qs = sp.toString();
  return qs ? `${link.route}?${qs}` : link.route;
}
