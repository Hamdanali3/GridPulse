# GridPulse — Chitral renewable operations platform

GridPulse is a control-room web application for the hydro, solar and wind plants of Chitral district,
Khyber Pakhtunkhwa. It shows live generation from every plant, raises alerts when a unit crosses its
thresholds, and turns each alert into a tracked work order for the field crew.

Built as the Week 8 capstone of my full-stack internship: **Laravel 12 REST API + React 18 SPA**.
New here? Read [ABOUT.md](ABOUT.md) for the plain-language story: the place, the problem, what the
product does and how it works.

![Overview](docs/screenshots/02-overview.png)

## The problem in one paragraph

Chitral's power comes from plants scattered across a Hindu Kush district with winter road closures:
one 108 MW hydro plant, a new 69 MW plant, village micro-hydro schemes, solar fields in the high valleys.
Each keeps its own log; faults are reported by phone. Nobody can quickly answer *how much are we
producing, which unit is failing, and who is fixing it*. GridPulse answers all three on one screen and
turns every alert into tracked work.

## Features

- **Live fleet overview** — fleet output, capacity factor and availability rings, 60-minute live
  chart, 24-hour generation stacked by technology, Chitral map with status-coloured plant pins.
- **Sites and assets** — full CRUD with validation, search, filters, pagination, per-site summary,
  24 h / 3 d / 7 d generation and efficiency charts, asset health scores.
- **Alerts** — generated automatically by rule evaluation (low efficiency, high temperature, asset
  offline, zero output) with open → acknowledged → resolved lifecycle and one-click conversion to a
  work order.
- **Work orders** — Kanban board and table, priority and due dates, assignees, linked to the site,
  asset and alert they came from; finishing the work resolves the alert.
- **Reports** — energy by site, technology or day for any date range, CSV export.
- **Team and audit** — admin manages roles and deactivation; every sign-in and change is logged.
- **PulseBot AI Copilot & Public Guide** — role-aware Groq assistant across two surfaces: an in-app Session Copilot dock (`Admin`, `Engineer`, `Viewer`) that answers strictly from real operational SQL aggregates with KPI cards, Recharts visuals, tables, and pre-filtered React Router deep links; plus a public Homepage Info Box on `/` and `/login` backed exclusively by curated project documentation with zero private database access. See [docs/ASSISTANT.md](docs/ASSISTANT.md).
- **Telemetry simulator** — a Laravel scheduled command (and `pg_cron` job on Supabase) that plays the role of the field devices,
  producing physically plausible readings every 5 seconds (solar follows a daylight curve, wind
  follows a turbine power curve, hydro is steady base load).

## Stack

| Layer | Choice |
| --- | --- |
| Production Backend | Supabase PostgreSQL + Row Level Security (RLS), SQL RPCs (`public.gp_api`, `public.gp_assistant_exec_tool`), `pg_cron` simulator, Supabase Edge Functions (`api`, `pulsebot`, `pulsebot-public`) |
| AI Copilot | Groq (`llama-3.3-70b-versatile`, configurable via `GROQ_MODEL`), SSE streaming, server-side JSON contract validation, per-user & per-IP rate limiting |
| Reference API | Laravel 12, PHP 8.4+, Laravel Sanctum tokens, Form Requests, API Resources, PHPUnit (`Http::fake` assistant suite) |
| Client | React 18, TypeScript, Vite, React Router, TanStack Query, React Hook Form + Zod, Recharts, Leaflet, Tailwind CSS v4 (deployed on Vercel) |
| Ops | Vercel SPA + Supabase Edge/Postgres, Docker Compose (MySQL + API + nginx client), GitHub Actions CI |

## How to run it (step by step)

### 0. What you need installed

| Tool | Version | Check | Install |
| --- | --- | --- | --- |
| PHP | 8.4 or newer | `php -v` | macOS: `brew install php` · Windows: [XAMPP](https://www.apachefriends.org/) or [Laravel Herd](https://herd.laravel.com/) · Ubuntu: `sudo apt install php8.4 php8.4-sqlite3 php8.4-mbstring php8.4-xml php8.4-intl php8.4-curl` |
| Composer | 2.x | `composer -V` | https://getcomposer.org/download/ |
| Node.js | 20 or newer | `node -v` | https://nodejs.org (LTS) |
| Git | any | `git -v` | https://git-scm.com |

No database server is needed for local use: the API uses a SQLite file. MySQL is only for production.

### 1. Get the code

```bash
git clone https://github.com/Hamdanali3/GridPulse.git
cd GridPulse
```

### 2. Start the API (terminal 1)

```bash
cd api
composer install                       # PHP dependencies
cp .env.example .env                   # local settings (SQLite, CORS for localhost:3000)
php artisan key:generate               # app encryption key
touch database/database.sqlite         # Windows PowerShell: New-Item database/database.sqlite
php artisan migrate:fresh --seed       # tables + Chitral demo fleet + 7 days of readings (~20 s)
php artisan serve                      # API on http://localhost:8000
```

Check it: open http://localhost:8000/api/v1/health — you should see `"status":"ok"`.

### 3. Start the telemetry simulator (terminal 2)

```bash
cd api
php artisan schedule:work              # writes a reading per unit every 5 s; first tick at the next minute
```

Alternative that starts immediately: `php artisan gridpulse:tick --loop`. Without this process the
dashboard still works but the numbers do not move.

### 4. Start the web app (terminal 3)

```bash
cd client
npm install
npm run dev                            # http://localhost:3000
```

The dev server proxies `/api` to `http://localhost:8000`, so no extra configuration is needed.

### 5. Sign in

Open http://localhost:3000 and use a demo account (or click the role buttons on the login page):

| Role | Email | Password | Can do |
| --- | --- | --- | --- |
| Admin | admin@gridpulse.io | Admin12345 | everything, manage team, delete, audit log |
| Engineer | engineer@gridpulse.io | Engineer12345 | create/edit sites, units, work orders; handle alerts |
| Viewer | viewer@gridpulse.io | Viewer12345 | read only |

### 6. Stop, reset, reseed

- Stop any process with `Ctrl+C`.
- Fresh demo data: `php artisan migrate:fresh --seed` (stop the scheduler first, or it may tick mid-seed).
- Clear old readings only: `php artisan gridpulse:prune --days=7`.

### Run with Docker instead (MySQL, production-style)

```bash
cp .env.docker.example .env            # then put a key in APP_KEY (cd api && php artisan key:generate --show)
docker compose up --build              # client http://localhost:3000 · API http://localhost:8000
```

The API container migrates, seeds the demo fleet on first boot, runs the scheduler and serves HTTP.

### Common problems

| Symptom | Fix |
| --- | --- |
| `Class "PDO" not found` / `could not find driver` | Enable `pdo_sqlite` in `php.ini` (Windows: uncomment `extension=pdo_sqlite`) |
| `Missing required environment variable` / `No application encryption key` | `cp .env.example .env && php artisan key:generate` inside `api` |
| Login says "Cannot reach the server" | API not running on port 8000, or you opened the client on a port other than 3000/5173 (add it to `CLIENT_ORIGIN` in `api/.env`) |
| Dashboard number does not move | The scheduler (terminal 2) is not running |
| `database is locked` in the log | Only when two schedulers run at once; stop the extra one |
| Port 3000 already in use | `npm run dev -- --port 3001`, then add `http://localhost:3001` to `CLIENT_ORIGIN` |
| Map tiles do not load | Needs internet access; tiles come from OpenStreetMap, OpenTopoMap and Esri |

## Tests

```bash
cd api && php artisan test      # 49 feature + unit tests (including PulseBot RBAC & acceptance scenarios)
cd client && npm run lint && npm run test:assistant && npm run build
```

## Architecture

```
Browser (Vercel SPA: React 18 + Recharts + React Router)
  ├── Control Room REST/RPC ────────► Supabase PostgREST (`public.gp_api` + RLS)
  ├── Session Copilot (SSE + Auth) ─► Supabase Edge Function `/functions/v1/pulsebot` ──► Groq API
  │                                       └──► Verified SQL tools (`gp_assistant_exec_tool`)
  └── Homepage Info Box (Public) ───► Supabase Edge Function `/functions/v1/pulsebot-public` ──► Groq API
                                          └──► Curated Knowledge Base only (zero operational DB tools)
```

## Project layout

```
api/                     Laravel 12 API (local dev, Docker & PHPUnit test suite)
  app/Enums              PHP enums for roles, statuses, severities
  app/Http/Controllers   one controller per resource (including AssistantController)
  app/Http/Requests      Form Request validation
  app/Http/Resources     JSON shapes returned to the client
  app/Services           TelemetrySimulator, EnergyService, AuditLogger, Assistant/*
  resources/knowledge    versioned curated PulseBot knowledge base (gridpulse_kb.json)
  database/migrations    schema + assistant_usage / assistant_logs
  tests/Feature          PHPUnit suite (including AssistantTest with Http::fake)
supabase/                Production Supabase backend
  config.toml            Edge Function gateway configuration
  migrations/            PostgreSQL schema, RLS policies, simulator & PulseBot SQL RPCs
  functions/             Edge Functions: `api`, `pulsebot`, `pulsebot-public`, `_shared/`
client/                  React SPA (deployed on Vercel)
  src/lib                api client, SSE assistant client, auth context, types, formatters
  src/components/chat    ChatDock, AssistantMessageCard, AssistantVisuals, PublicInfoBox
  src/pages              one file per screen (with URL query-param deep-link filters)
docs/                    PRD, database design, API contract, wireframes, SUPABASE_DEPLOYMENT, ASSISTANT
```

## API

Base URL `/api/v1`. Full contract in [docs/API_ROUTES.md](docs/API_ROUTES.md) and assistant contract in [docs/ASSISTANT.md](docs/ASSISTANT.md). Every response uses one
envelope: `{ success, data, meta? }` or `{ success: false, error: { code, message, details? } }`.

Key PulseBot endpoints:
- `GET /api/v1/assistant/bootstrap` (or `GET /functions/v1/pulsebot`) — authenticated role persona & starter prompts
- `POST /api/v1/assistant/chat` (or `POST /functions/v1/pulsebot`) — authenticated SSE / JSON Session Copilot
- `GET /api/v1/assistant/logs` — Admin-only assistant telemetry & tool audit trail
- `POST /api/v1/assistant/public` (or `POST /functions/v1/pulsebot-public`) — public Homepage Info Box (curated KB only)

## Roles

| | Viewer | Engineer | Admin |
| --- | --- | --- | --- |
| Read everything | ✓ | ✓ | ✓ |
| Create / edit sites, assets, work orders | | ✓ | ✓ |
| Acknowledge / resolve alerts | | ✓ | ✓ |
| Delete records | | | ✓ |
| Manage team, view audit log | | | ✓ |

Enforced server-side by the `role:` middleware on every write route; the client only hides controls.

## Deployment

GridPulse deploys with **Vercel** hosting the static React SPA (`client/`) and **Supabase** running the production backend (PostgreSQL `public.gp_api` RPC, Edge Function `supabase/functions/api`, `pg_cron` live telemetry simulator, and Row Level Security). See [docs/SUPABASE_DEPLOYMENT.md](docs/SUPABASE_DEPLOYMENT.md) for the full Supabase setup.

### Deploy PulseBot & Supabase backend

Store the Groq secret in Supabase (never in Vercel or `VITE_*` variables), push migrations, and deploy the Edge Functions:

```bash
npx supabase secrets set GROQ_API_KEY=gsk_... GROQ_MODEL=llama-3.3-70b-versatile
npx supabase db push
npx supabase functions deploy pulsebot
npx supabase functions deploy pulsebot-public
```

For local Edge Function testing, copy `supabase/.env.example` to git-ignored `supabase/.env.local` and run `npx supabase functions serve --env-file supabase/.env.local`. Full instructions in [docs/ASSISTANT.md](docs/ASSISTANT.md).

### Deploy the web app to Vercel

1. Vercel → **Add New… → Project** → import `Hamdanali3/GridPulse`.
2. Leave **Root Directory** as `/` (the root `vercel.json` builds `client/` for you), **or** set it to `client`.
   Both work. Do not point it at `api`.
3. **Environment Variables** (optional if using the built-in Supabase project defaults):
   - `VITE_SUPABASE_URL` = `https://<your-project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `<your-supabase-anon-public-key>`
4. Deploy. Client routes such as `/sites/3` fall back to `index.html` through the rewrite in `vercel.json`.

### Optional: Self-host the Laravel API with Docker

If you prefer running the PHP/Laravel container directly instead of Supabase, build and run `api/Dockerfile` on any Docker host:

```bash
docker build -t gridpulse-api api && docker run -p 8000:8000 gridpulse-api
```

Then set `VITE_API_URL` in Vercel to your container's public `https://` origin and redeploy the client.

### Vercel troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `404: NOT_FOUND` on the deployed URL | Project imported at repo root before the root `vercel.json` existed, so nothing was built | Pull latest `main` and redeploy, or set Root Directory to `client` |
| "No Output Directory named 'dist' found" | Root Directory set to `/` with an old build config | Same as above |
| Build fails on `tsc -b` | Node < 20 | Project Settings → Node.js Version → 20.x or 22.x |
| Refreshing `/sites/3` gives 404 | Missing rewrite | Make sure `vercel.json` is deployed |

## Author

Hamdan Ali — Week 8 capstone. Planning documents, day-by-day notes and the presentation are in the
sibling `day36` … `day40` folders.
