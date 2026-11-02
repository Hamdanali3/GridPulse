// Hardened PostgreSQL bridge for PulseBot Edge Functions.
// - Never trusts user_id or role from request body; resolves session strictly from Authorization token.
// - Never uses SUPABASE_SERVICE_ROLE_KEY in tools that return data to users, and NEVER in pulsebot-public.

import postgres from 'npm:postgres@3.4.5';
import { UserRole } from './navigation.ts';

const dbUrl = Deno.env.get('SUPABASE_DB_URL') ?? Deno.env.get('DB_URL') ?? '';

const sql = dbUrl
  ? postgres(dbUrl, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    })
  : null;

export interface SessionContext {
  authenticated: boolean;
  status?: number;
  code?: string;
  message?: string;
  user_id: number;
  name: string;
  role: UserRole;
  permissions: string[];
  today: string;
  now_local: string;
  timezone: string;
  available_scopes: string[];
}

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  limit: number;
  retry_after_seconds: number;
}

// In-memory fallback rate limiter (used if DB rate-limit bucket is temporarily unreachable)
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function checkMemoryRateLimit(scope: string, identifier: string, windowSeconds: number, maxRequests: number): RateLimitDecision {
  const now = Date.now();
  const bucketWindow = Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
  const key = `${scope}:${identifier}:${bucketWindow}`;

  if (memoryBuckets.size > 500) {
    for (const [k, v] of memoryBuckets.entries()) {
      if (v.resetAt <= now) memoryBuckets.delete(k);
    }
  }

  const existing = memoryBuckets.get(key);
  const resetAt = bucketWindow + windowSeconds * 1000;
  const nextCount = (existing?.count ?? 0) + 1;
  memoryBuckets.set(key, { count: nextCount, resetAt });

  return {
    allowed: nextCount <= maxRequests,
    count: nextCount,
    limit: maxRequests,
    retry_after_seconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

async function callAnonRpc<T>(fnName: string, payload: Record<string, unknown>, authHeader?: string | null): Promise<T> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) {
    throw new Error('Database connection is not configured.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: anonKey,
  };
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`RPC ${fnName} failed with HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function resolveSessionContext(authHeader: string | null): Promise<SessionContext> {
  if (sql) {
    const rows = await sql<{ ctx: SessionContext }[]>`
      SELECT public.gp_assistant_resolve_user(${authHeader}) AS ctx
    `;
    return rows[0]?.ctx ?? {
      authenticated: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Sign in to use PulseBot.',
      user_id: 0,
      name: '',
      role: 'viewer',
      permissions: [],
      today: '',
      now_local: '',
      timezone: 'Asia/Karachi',
      available_scopes: [],
    };
  }

  return await callAnonRpc<SessionContext>('gp_assistant_resolve_user', { p_token: authHeader ?? '' }, authHeader);
}

export async function fetchAssistantBootstrap(authHeader: string | null): Promise<{ status: number; body: unknown }> {
  if (sql) {
    const rows = await sql<{ res: { status: number; body: unknown } }[]>`
      SELECT public.gp_assistant_bootstrap(${authHeader}) AS res
    `;
    return rows[0]?.res ?? {
      status: 401,
      body: { success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } },
    };
  }

  return await callAnonRpc<{ status: number; body: unknown }>(
    'gp_assistant_bootstrap',
    { p_token: authHeader ?? '' },
    authHeader,
  );
}

export async function execSqlTool(
  authHeader: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (sql) {
    const rows = await sql<{ res: Record<string, unknown> }[]>`
      SELECT public.gp_assistant_exec_tool(${authHeader}, ${toolName}, ${sql.json(JSON.parse(JSON.stringify(args ?? {})))}) AS res
    `;
    return rows[0]?.res ?? { error: 'empty_result', message: 'No response from database tool.' };
  }

  return await callAnonRpc<Record<string, unknown>>(
    'gp_assistant_exec_tool',
    { p_token: authHeader, p_tool: toolName, p_args: args },
    authHeader,
  );
}

export async function checkRateLimit(
  scope: 'session' | 'public',
  identifier: string,
  windowSeconds: number,
  maxRequests: number,
): Promise<RateLimitDecision> {
  if (sql) {
    try {
      const rows = await sql<{ res: RateLimitDecision }[]>`
        SELECT public.gp_assistant_check_rate_limit(${scope}, ${identifier}, ${windowSeconds}, ${maxRequests}) AS res
      `;
      if (rows[0]?.res) return rows[0].res;
    } catch {
      // Fall back to in-memory limiter if table/migration is still syncing
    }
  }
  return checkMemoryRateLimit(scope, identifier, windowSeconds, maxRequests);
}

export async function writeAssistantLog(entry: {
  userId: number | null;
  role: string;
  surface: 'session' | 'public';
  toolsUsed: string[];
  toolRounds: number;
  latencyMs: number;
  status: string;
  errorCode?: string | null;
  ipHash?: string | null;
}): Promise<void> {
  if (!sql) return;
  try {
    await sql`
      SELECT public.gp_assistant_write_log(
        ${entry.userId},
        ${entry.role},
        ${entry.surface},
        ${sql.json(entry.toolsUsed)},
        ${entry.toolRounds},
        ${entry.latencyMs},
        ${entry.status},
        ${entry.errorCode ?? null},
        ${entry.ipHash ?? null}
      )
    `;
  } catch {
    // Logging must never crash the assistant response stream
  }
}

