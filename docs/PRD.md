# GridPulse — Product Requirements Document

Version 1.0 · Day 36 · Capstone planning

## 1. Problem

Chitral district in Khyber Pakhtunkhwa runs on renewable power: the 108 MW Golen Gol plant, the
new Lawi plant, a chain of village micro-hydro schemes on glacier-fed streams, and a growing number
of solar fields in the high, dry valleys of Upper Chitral. The plants are spread across a mountainous
district the size of a small country, road access closes in winter, and operators still track
generation in spreadsheets and receive fault calls by phone. They cannot answer three questions quickly:

1. How much power is the fleet producing right now, and is it what we expected?
2. Which assets are under-performing or faulted, and who is dealing with it?
3. What maintenance is scheduled, overdue or blocking generation?

## 2. Product vision

GridPulse is a single control-room web application for Chitral's renewable fleet: the operations
team sees live generation from every plant, gets alerted the moment a unit degrades, and turns each
alert into a tracked work order for the field crew.

## 3. Users and roles

| Role | Who | Can do |
| --- | --- | --- |
| Admin | Operations manager | Everything, plus manage team members and roles |
| Engineer | Field / control-room engineer | Create and edit sites, assets, work orders; acknowledge and resolve alerts |
| Viewer | Executive, client, auditor | Read-only access to dashboards, sites, alerts, reports |

## 4. Core features (MVP scope)

### 4.1 Authentication and accounts
- Register (first user becomes admin), login, logout, refresh session silently.
- Laravel Sanctum personal access tokens (Bearer), 7-day expiry, revoked on logout and password change.
- Profile page: update name, change password.
- Admin: list users, change role, deactivate.

### 4.2 Sites
- CRUD for sites (plants) with type (hydro, solar, wind), capacity in MW, location (lat/lng, region such as Upper Chitral), status
  (online, degraded, offline, maintenance), commissioning date.
- Site detail page: assets, 24-hour generation chart, open alerts, work orders, map pin.

### 4.3 Assets
- CRUD for assets belonging to a site: inverters, turbines, panel strings, transformers.
- Each asset has rated capacity, serial, manufacturer, health score and status.

### 4.4 Telemetry (live data flow)
- A Laravel console command on the scheduler simulates readings for every asset every 5 seconds: power
  output (kW), efficiency (%), temperature (°C), wind speed or irradiance depending on site type.
- Readings are stored (7-day retention enforced by a prune command) and the client polls aggregate
  endpoints every 5 seconds, so the dashboard moves without a page refresh.
- Aggregation endpoints give fleet totals, per-site series and daily energy (kWh).

### 4.5 Alerts
- Rules: efficiency below threshold, temperature above threshold, asset offline, output zero while online.
- Alert lifecycle: open → acknowledged → resolved. Severity: critical, warning, info.
- Alerts feed on dashboard; alerts page with filters; acknowledge / resolve actions; convert to work order.

### 4.6 Work orders
- CRUD with title, description, priority, status (planned, in progress, blocked, done), assignee,
  due date, linked site/asset/alert.
- Kanban-style board and table view.

### 4.7 Dashboard
- Live fleet output number and live chart (last 60 minutes).
- KPI tiles: today's energy, fleet availability, open alerts, work orders due this week.
- Fleet map with site pins coloured by status.
- Generation by site type, top and bottom performing sites.

### 4.8 Reports
- Energy by site over a date range; export as CSV.

### 4.9 Audit log
- Every create, update, delete and auth event is recorded with actor, entity and diff summary.

## 5. Non-functional requirements

- Response time under 200 ms for list endpoints on seeded data.
- All inputs validated with Form Requests on the server; consistent JSON error envelope.
- Security: CORS allow-list, rate-limited auth endpoints, Eloquent parameter binding (no raw SQL from
  input), mass-assignment protection, passwords hashed with bcrypt.
- Accessibility: WCAG AA contrast, keyboard navigation, `prefers-reduced-motion` respected.
- Responsive from 360 px to 1920 px.
- Test coverage for auth, RBAC and every CRUD resource.

## 6. Out of scope (documented for honesty)

- Real SCADA / inverter integrations (simulated telemetry instead).
- Email or SMS notifications.
- Multi-tenant organisations.

## 7. Success metrics for the capstone evaluation

- All acceptance criteria in `PROJECT_PROMPT.md` met.
- Clean, readable Git history with a commit per milestone.
- Evaluator can clone, seed, run and log in within five minutes using the README.

## 8. Milestone plan

| Day | Milestone | Exit criteria |
| --- | --- | --- |
| 36 | Planning | PRD, ERD, schema, API contract, wireframes approved |
| 37 | Build core | Design system, app shell, API skeleton, models, seed |
| 38 | Complete flows | Auth, RBAC, all CRUD, scheduled telemetry, dashboard live |
| 39 | Harden | Tests green, bugs fixed, Docker, CI, deployment guide |
| 40 | Present | Deck, demo script, architecture walkthrough, repository |
