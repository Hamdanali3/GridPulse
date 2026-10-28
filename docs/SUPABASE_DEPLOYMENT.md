# GridPulse — 100% Native Supabase Backend Deployment

GridPulse now runs its **entire backend natively inside Supabase** (PostgreSQL RPC + Edge Functions + `pg_cron` live telemetry simulator + Row Level Security) alongside the **Vercel** React frontend (`https://grid-pulse-ruby.vercel.app`) — **100% free forever, no credit card, no expiring tunnels or container hosts**.

---

## Architecture Overview

| Layer | Service | Role |
|---|---|---|
| **Frontend SPA** | **Vercel** (`client/`) | Static Vite + React 18 control-room UI |
| **API Engine** | **Supabase PostgreSQL (`public.gp_api`) + Edge Function (`supabase/functions/api`)** | All 29 `/api/v1/*` endpoints, Sanctum SHA-256 token auth, bcrypt verification (`pgcrypto`), RBAC (`admin` / `engineer` / `viewer`), audit logs, CSV export |
| **Live Telemetry Simulator** | **Supabase `pg_cron` (`gridpulse-tick` & `gridpulse-prune`) + Sub-Minute Freshness** | Generates realistic Chitral solar/wind/hydro readings, evaluates alert rules, updates health scores, and prunes readings older than 7 days |

---

## Option A — Connect Frontend Directly via Supabase Publishable (`anon`) Key (Instant, Zero CLI)

Because `public.gp_api` is already deployed inside your Supabase PostgreSQL database (`zvrlxhwgmpqpbvzzadrc`) with Row Level Security locking down all raw tables:

1. Open your [Supabase Dashboard](https://supabase.com/dashboard/project/zvrlxhwgmpqpbvzzadrc/settings/api) → **Project Settings** → **API**.
2. Copy your **`anon` `public`** (or `publishable`) API key.
3. Add it to **Vercel** → `grid-pulse` → **Settings** → **Environment Variables**:
   - `VITE_SUPABASE_URL` = `https://zvrlxhwgmpqpbvzzadrc.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `<your-supabase-anon-public-key>`
4. Redeploy on Vercel (or push to `main`). Also add both variables to `client/.env` for local Vite runs without PHP.

---

## Option B — Deploy the Supabase Edge Function (`/functions/v1/api`)

If you deploy the included Edge Function [`supabase/functions/api/index.ts`](../supabase/functions/api/index.ts), standard REST clients and Vercel connect to `https://zvrlxhwgmpqpbvzzadrc.supabase.co/functions/v1/api` automatically without needing `VITE_SUPABASE_ANON_KEY`:

```bash
npx supabase login
npx supabase functions deploy api --project-ref zvrlxhwgmpqpbvzzadrc --no-verify-jwt
```

---

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@gridpulse.io` | `Admin12345` |
| **Engineer** | `engineer@gridpulse.io` | `Engineer12345` |
| **Viewer** | `viewer@gridpulse.io` | `Viewer12345` |
