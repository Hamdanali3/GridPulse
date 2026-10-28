// GridPulse — Supabase Edge Function API Gateway
// Exposes the full /api/v1/* REST contract directly from Supabase Edge Functions,
// delegating execution to the hardened PostgreSQL `public.gp_api` engine over SUPABASE_DB_URL.

import postgres from 'npm:postgres@3.4.5';

const dbUrl = Deno.env.get('SUPABASE_DB_URL') ?? Deno.env.get('DB_URL') ?? '';
const sql = postgres(dbUrl, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, apikey, x-client-info',
    'Access-Control-Expose-Headers': 'Content-Disposition',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const url = new URL(req.url);
    // Strip Edge Function mount prefix (`/functions/v1/api` or `/api`) so `/api/v1/...` or `/v1/...` or `/health` all resolve cleanly
    let routePath = url.pathname
      .replace(/^\/functions\/v1\/api(?=\/|$)/, '')
      .replace(/^\/api(?=\/v1(?:\/|$))/, '')
      .replace(/^\/api(?=\/|$)/, '');
    if (!routePath) routePath = '/health';

    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    let body: Record<string, unknown> = {};
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
      const text = await req.text();
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: 'BAD_REQUEST', message: 'Invalid JSON request body.' },
            }),
            { status: 400, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } },
          );
        }
      }
    }

    const authHeader = req.headers.get('authorization');
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('cf-connecting-ip') ??
      null;
    const ua = req.headers.get('user-agent') ?? null;

    const rows = await sql<{ res: { status: number; body?: unknown; is_csv?: boolean; filename?: string; csv?: string } }[]>`
      SELECT public.gp_api(
        ${req.method},
        ${routePath},
        ${sql.json(query)},
        ${sql.json(body)},
        ${authHeader},
        ${ip},
        ${ua}
      ) AS res
    `;

    const result = rows[0]?.res ?? {
      status: 500,
      body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Empty response from database.' } },
    };

    if (result.is_csv) {
      return new Response(result.csv ?? '', {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${result.filename ?? 'gridpulse-energy.csv'}"`,
        },
      });
    }

    if (result.status === 204) {
      return new Response(null, { status: 204, headers });
    }

    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err) {
    console.error('GridPulse Edge Function error:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Database connection error. Please retry.' },
      }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
});
