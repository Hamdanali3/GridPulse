# 100% Free Backend Deployment (NO Credit Card Required)

GridPulse's backend now runs **100% natively inside Supabase** — no Railway, Render, Koyeb, or Cloudflare tunnels required.

See **[SUPABASE_DEPLOYMENT.md](./SUPABASE_DEPLOYMENT.md)** for the complete setup and architecture details.

## Quick Summary

1. **Database, API Engine & Telemetry Simulator**: Hosted natively in Supabase (`zvrlxhwgmpqpbvzzadrc`) via [`supabase/migrations/20261028000000_gridpulse_supabase_backend.sql`](../supabase/migrations/20261028000000_gridpulse_supabase_backend.sql) and [`supabase/functions/api/index.ts`](../supabase/functions/api/index.ts).
2. **Frontend**: Hosted on Vercel (`https://grid-pulse-ruby.vercel.app`), connected directly to Supabase via either:
   - The Supabase Edge Function (`https://zvrlxhwgmpqpbvzzadrc.supabase.co/functions/v1/api`), or
   - Direct Supabase PostgREST RPC (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).
