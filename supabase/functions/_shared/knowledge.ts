// Curated public & domain knowledge base for GridPulse ("PulseBot").
// Contains ZERO private operational data, live readings, user records, or secrets.

export interface KnowledgeTopic {
  id: string;
  title: string;
  keywords: string[];
  content: string;
}

export const KNOWLEDGE_VERSION = '1.0.0';

export const KNOWLEDGE_TOPICS: KnowledgeTopic[] = [
  {
    id: 'overview-and-problem',
    title: 'What GridPulse Is and the Chitral Problem It Solves',
    keywords: ['gridpulse', 'what is', 'about', 'chitral', 'problem', 'hindu kush', 'purpose', 'why', 'overview', 'valley', 'khyber pakhtunkhwa'],
    content:
      "GridPulse is a real-time control-room web application for the renewable power fleet of Chitral district in Khyber Pakhtunkhwa, Pakistan. Chitral sits deep in the Hindu Kush mountains, isolated from the national grid like a city would be, and winter snow regularly closes mountain roads. Power comes from 11 distributed plants (~190.4 MW nominal installed capacity): major hydropower stations (108 MW Golen Gol and 69 MW Lawi), village micro-hydro schemes on glacier-fed streams (Reshun, Shishi, Chitral Town, Bumburet, Garam Chashma), high-valley solar fields (Mastuj, Booni, Drosh), and the Shandur plateau wind pilot. Historically each plant kept separate logbooks and reported faults by phone, leaving operators unable to quickly answer three questions: (1) How much power are we producing right now vs expected? (2) Which unit is degrading or offline, and who is handling it? (3) What maintenance is planned, overdue, or blocked? GridPulse answers all three on one screen and closes the loop from live telemetry to alerts to tracked work orders.",
  },
  {
    id: 'features-and-screens',
    title: 'Platform Features and Screens',
    keywords: ['features', 'screens', 'pages', 'capabilities', 'map', 'kanban', 'reports', 'csv', 'dashboard', 'sites', 'assets', 'pulsebot'],
    content:
      "GridPulse provides seven integrated operational areas: (1) Live Fleet Overview (`/`) — real-time fleet output updated every 5 seconds, capacity factor and availability gauges, 60-minute live output curve, 24-hour stacked generation by technology (hydro, solar, wind), and an interactive Leaflet map of Chitral with status-coloured plant pins; (2) Sites (`/sites` and `/sites/:id`) — search, technology/status filters, sparklines, per-site output, 24h/3d/7d generation & efficiency charts, and unit tables; (3) Assets (`/assets`) — inverters, wind turbines, panel strings, and hydro turbine-generators with rated kW, live readings, and 0–100 health scores; (4) Alerts (`/alerts`) — automated threshold detection with Open → Acknowledged → Resolved lifecycle; (5) Work Orders (`/work-orders`) — drag-and-drop Kanban board (Planned, In progress, Blocked, Done) and filterable table with priorities, due dates, and assignees; (6) Energy Reports (`/reports`) — kWh/MWh totals grouped by site, technology, or day over any date window with one-click CSV export; (7) Team & Audit Log (`/team`, `/audit`) — admin role management, account activation, and full immutable change history; plus PulseBot, the role-aware AI operations copilot.",
  },
  {
    id: 'roles-and-permissions',
    title: 'Roles, Permissions, and RBAC Enforcement',
    keywords: ['roles', 'permissions', 'rbac', 'admin', 'engineer', 'viewer', 'access', 'who can', 'delete', 'audit', 'team', 'security'],
    content:
      "GridPulse enforces three roles server-side on every API route and assistant tool (the UI hides disallowed controls, while PostgreSQL/Laravel middleware enforces rules strictly): (1) Viewer — read-only access to Fleet Overview, Sites, Assets, Alerts, Work Orders, Energy Reports, CSV downloads, and personal Settings; cannot create, edit, acknowledge, resolve, delete, or view Team and Audit Log. (2) Engineer — all Viewer capabilities plus operational write access: create and edit Sites, Assets, and Work Orders, move Kanban cards, acknowledge and resolve Alerts, and convert Alerts into Work Orders; cannot delete records or access Team management or the Audit Log. (3) Admin — full control across the platform: everything Engineers can do plus deleting Sites, Assets, and Work Orders, managing user roles and active status on `/team`, and searching the full security and operational trail on `/audit`. PulseBot itself is strictly read-only for all roles: it analyses data and provides deep navigation links, never performing write mutations.",
  },
  {
    id: 'alerts-to-work-orders',
    title: 'How Alerts Become Work Orders (Closed-Loop Maintenance)',
    keywords: ['alerts', 'work orders', 'lifecycle', 'acknowledge', 'resolve', 'threshold', 'rules', 'kanban', 'convert', 'closed loop', 'workflow'],
    content:
      "Every incoming telemetry reading is evaluated automatically against site thresholds: (a) `asset_offline` (critical) when a unit is offline; (b) `low_efficiency` (warning, or critical if >15 percentage points below `min_efficiency`, default 70%) while actively generating; (c) `high_temperature` (warning, or critical if >10 °C above `max_temperature`, default 65 °C); and (d) `zero_output` (warning) when an online unit at an online plant reports 0 kW during producing hours. De-duplication ensures only one active (`open` or `acknowledged`) alert per unit and rule type exists at a time. An Engineer or Admin can Acknowledge an alert to claim ownership, Resolve it directly, or click 'Create work order' to atomically create a linked Work Order (inheriting site, asset, message, and default priority: critical→urgent, warning→high, info→medium) while marking the alert Acknowledged. Moving that Work Order to `done` on `/work-orders` automatically resolves the linked Alert.",
  },
  {
    id: 'glossary-metrics',
    title: 'Operational Glossary: Capacity Factor, Availability, Efficiency, Health Score, MTTR',
    keywords: ['capacity factor', 'availability', 'efficiency', 'health score', 'mttr', 'mean', 'definition', 'formula', 'glossary', 'units', 'kw', 'mw', 'kwh', 'mwh'],
    content:
      "Key operational metrics in GridPulse: • Capacity Factor (%): `(current_output_kw / installed_capacity_kw) × 100`. Shows how much of the fleet's or plant's maximum nameplate rating is currently being produced (e.g., hydro runs high steady base load ~80%, whereas solar peaks midday and drops to 0% at night). • Availability (%): `(online_assets / total_assets) × 100`. Measures the share of generating units ready and online rather than offline, degraded, or in maintenance. • Efficiency (%): Instantaneous conversion efficiency reported by a unit's telemetry; compared against each site's `min_efficiency` threshold. • Health Score (0–100): Exponential moving average (EMA: 95% prior + 5% recent efficiency target) tracking mechanical/electrical condition (`85–100` healthy, `65–84` watch, `<65` degraded). • Energy (kWh / MWh): Computed per unit per day as average power (kW) multiplied by elapsed operating hours (`1 MWh = 1,000 kWh`; `1 MW = 1,000 kW`). • MTTR (Mean Time To Resolve): Average duration between an alert's `created_at` and `resolved_at` timestamps.",
  },
  {
    id: 'telemetry-simulator',
    title: 'How Live Telemetry Is Simulated',
    keywords: ['telemetry', 'simulator', 'simulated', 'sensor', '5 seconds', 'solar', 'wind', 'hydro', 'pg_cron', 'schedule', 'prune', 'retention'],
    content:
      "Because classroom and demo deployments are not wired to physical SCADA gateways in Chitral, GridPulse includes a deterministic physics-inspired telemetry simulator (`TelemetrySimulator` in Laravel and `public.gp_simulate_tick` + `pg_cron` in Supabase). Every 5 seconds (with sub-minute freshness checks), it generates a reading per asset: • Solar plants follow Chitral's local solar elevation curve (`1000 × sin(π·x)^1.4 W/m²` between 06:00 and 20:00 local time) modulated by cloud cover, unit health, and ambient/panel temperature. • Wind turbines on the Shandur plateau model wind speed (`m/s`) and apply a cubic turbine power curve between cut-in (`3 m/s`), rated (`12 m/s`), and cut-out (`25 m/s`). • Hydropower units model steady river base load (~82% capacity factor with gentle sinusoidal flow variation). Degraded units suffer ~28% output/efficiency derating and elevated temperature (+12 to +16 °C), naturally triggering realistic alerts. Readings are retained for a rolling 7-day window via automated daily pruning.",
  },
  {
    id: 'tech-stack',
    title: 'Technology Stack and Architecture',
    keywords: ['stack', 'technology', 'architecture', 'react', 'typescript', 'vite', 'tailwind', 'supabase', 'laravel', 'postgresql', 'vercel', 'groq', 'edge functions'],
    content:
      "GridPulse is built with: • Frontend (`client/`): React 18, TypeScript, Vite, React Router v6, TanStack Query v5, React Hook Form + Zod validation, Recharts data visualisations, Leaflet interactive maps, and Tailwind CSS v4 with light/dark architectural minimalism, deployed on Vercel. • Backend & Database (`supabase/` + `api/`): Native Supabase PostgreSQL with Row Level Security (RLS), `pgcrypto` authentication, Sanctum SHA-256 personal access tokens, SQL aggregation RPCs, `pg_cron` live telemetry simulation, and Supabase Edge Functions, paired with a full-parity Laravel 12 (PHP 8.4+) REST API and PHPUnit test suite. • AI Copilot (PulseBot): Powered by Groq tool-calling and JSON synthesis inside Supabase Edge Functions (`pulsebot` for authenticated role-scoped sessions and `pulsebot-public` for the public homepage guide), keeping API keys strictly server-side.",
  },
  {
    id: 'how-to-try-demo',
    title: 'How to Try GridPulse and Demo Accounts',
    keywords: ['try', 'demo', 'login', 'sign in', 'account', 'password', 'email', 'credentials', 'register', 'test', 'get started'],
    content:
      "You can explore GridPulse immediately without a credit card: open the Sign In page (`/login`) and click one of the three Demo Account buttons under 'Demo accounts' to auto-fill credentials, or enter them directly: • Admin: `admin@gridpulse.io` / `Admin12345` (full fleet ops, team management, deletions, audit log) • Engineer: `engineer@gridpulse.io` / `Engineer12345` (sites, assets, alerts handling, work order board) • Viewer: `viewer@gridpulse.io` / `Viewer12345` (read-only dashboards and energy reports). You can also register a fresh Viewer account at `/register`.",
  },
  {
    id: 'author-and-credits',
    title: 'Who Built GridPulse',
    keywords: ['who built', 'author', 'creator', 'developer', 'hamdan', 'capstone', 'internship', 'github', 'source'],
    content:
      "GridPulse was designed and engineered by Hamdan Ali as the Week 8 full-stack capstone project, progressing from PRD, ERD, database schema, API contract, and wireframes through full-stack implementation, automated testing, Docker/CI, and cloud deployment on Vercel and Supabase. Source code is available on GitHub at `https://github.com/Hamdanali3/GridPulse`.",
  },
];

export function searchKnowledge(query: string, limit = 4): KnowledgeTopic[] {
  const normalized = query.toLowerCase().trim();
  if (!normalized) return KNOWLEDGE_TOPICS.slice(0, limit);

  const tokens = normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const scored = KNOWLEDGE_TOPICS.map((topic) => {
    let score = 0;
    const hayTitle = topic.title.toLowerCase();
    const hayContent = topic.content.toLowerCase();

    for (const kw of topic.keywords) {
      if (normalized.includes(kw)) score += 6;
    }
    for (const tok of tokens) {
      if (hayTitle.includes(tok)) score += 4;
      if (topic.keywords.some((kw) => kw.includes(tok))) score += 3;
      if (hayContent.includes(tok)) score += 1.5;
    }
    return { topic, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter((s) => s.score > 0).map((s) => s.topic);
  return (matched.length > 0 ? matched : KNOWLEDGE_TOPICS).slice(0, limit);
}

export function fullKnowledgeContext(): string {
  return KNOWLEDGE_TOPICS.map((t) => `### ${t.title}\n${t.content}`).join('\n\n');
}

