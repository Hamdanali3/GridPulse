import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

const DEFAULT_SUPABASE_URL = 'https://zvrlxhwgmpqpbvzzadrc.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_bBb0fGJAWzlleCGjJ3ZvuA_xgqkmMtn';

function cleanUrl(raw: string | undefined): string {
  const first = (raw ?? '').trim().split(/\s+/)[0] ?? '';
  return first.replace(/\/+$/, '');
}

export const SUPABASE_URL = cleanUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

/**
 * Custom external API origin (only used if explicitly set to a live non-Supabase-RPC server,
 * such as `http://localhost:8000` for local PHP development).
 * Expired temporary tunnels (*.trycloudflare.com) and expired Railway URLs (*.up.railway.app)
 * are automatically ignored so deployments seamlessly use the native Supabase backend.
 */
function customApiOrigin(): string {
  const cleaned = cleanUrl(import.meta.env.VITE_API_URL as string | undefined).replace(/\/api\/v1$/, '');
  if (!cleaned) return '';
  if (/\.trycloudflare\.com$/i.test(cleaned) || /\.up\.railway\.app$/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}

export const CUSTOM_API_ORIGIN = customApiOrigin();
export const USE_SUPABASE_RPC = !CUSTOM_API_ORIGIN && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const API_ORIGIN = CUSTOM_API_ORIGIN || SUPABASE_URL;
export const API_URL = CUSTOM_API_ORIGIN ? `${CUSTOM_API_ORIGIN}/api/v1` : '/api/v1';

const TOKEN_KEY = 'gp_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode); the session simply will not persist
  }
}

interface SupabaseRpcEnvelope {
  status: number;
  body?: unknown;
  is_csv?: boolean;
  filename?: string;
  csv?: string;
}

/**
 * Native Supabase PostgREST RPC adapter (`POST /rest/v1/rpc/gp_api`).
 * Routes all GridPulse API calls directly to the hardened PostgreSQL `public.gp_api`
 * engine inside Supabase — preserving exact status codes, validation errors, and CSV blobs.
 */
const supabaseRpcAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  const rawUrl = config.url ?? '/';
  const [rawPath, inlineQuery] = rawUrl.split('?');
  const path = rawPath.replace(/^https?:\/\/[^/]+/, '') || '/';

  const query: Record<string, string> = {};
  if (inlineQuery) {
    new URLSearchParams(inlineQuery).forEach((v, k) => {
      query[k] = v;
    });
  }
  if (config.params && typeof config.params === 'object') {
    for (const [k, v] of Object.entries(config.params as Record<string, unknown>)) {
      if (v !== undefined && v !== null) {
        query[k] = String(v);
      }
    }
  }

  let body: Record<string, unknown> = {};
  if (config.data !== undefined && config.data !== null) {
    if (typeof config.data === 'string') {
      try {
        body = config.data.trim() ? (JSON.parse(config.data) as Record<string, unknown>) : {};
      } catch {
        body = {};
      }
    } else if (typeof config.data === 'object') {
      body = config.data as Record<string, unknown>;
    }
  }

  const authHeader =
    (config.headers?.get?.('Authorization') as string | undefined) ??
    (config.headers?.Authorization as string | undefined) ??
    (getToken() ? `Bearer ${getToken()}` : null);

  const rpcHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    apikey: SUPABASE_ANON_KEY,
  };
  if (SUPABASE_ANON_KEY.startsWith('eyJ')) {
    rpcHeaders.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  let rpcRes: Response;
  try {
    rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gp_api`, {
      method: 'POST',
      headers: rpcHeaders,
      body: JSON.stringify({
        p_method: (config.method ?? 'get').toUpperCase(),
        p_path: path,
        p_query: query,
        p_body: body,
        p_token: authHeader ?? null,
        p_ip: null,
        p_ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'GridPulseWeb',
      }),
      signal: config.signal as AbortSignal | undefined,
    });
  } catch (networkErr) {
    throw new AxiosError(
      networkErr instanceof Error ? networkErr.message : 'Network Error',
      AxiosError.ERR_NETWORK,
      config,
    );
  }

  if (!rpcRes.ok) {
    const errPayload = await rpcRes.json().catch(() => null);
    const msg = errPayload?.message ?? `Supabase RPC answered with HTTP ${rpcRes.status}.`;
    const response: AxiosResponse = {
      data: {
        success: false,
        error: { code: 'SUPABASE_GATEWAY_ERROR', message: msg },
      },
      status: rpcRes.status,
      statusText: rpcRes.statusText,
      headers: new AxiosHeaders({ 'content-type': 'application/json' }),
      config,
    };
    throw new AxiosError(msg, AxiosError.ERR_BAD_RESPONSE, config, undefined, response);
  }

  const envelope = (await rpcRes.json()) as SupabaseRpcEnvelope;
  const status = envelope?.status ?? 200;

  let data: unknown = envelope?.body ?? null;
  if (envelope?.is_csv) {
    const csvText = envelope.csv ?? '';
    data = config.responseType === 'blob' ? new Blob([csvText], { type: 'text/csv;charset=utf-8' }) : csvText;
  }

  const response: AxiosResponse = {
    data,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers: new AxiosHeaders({
      'content-type': envelope?.is_csv ? 'text/csv; charset=utf-8' : 'application/json',
    }),
    config,
  };

  if (status >= 400) {
    throw new AxiosError(
      `Request failed with status code ${status}`,
      status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      undefined,
      response,
    );
  }

  return response;
};

export const api = axios.create({
  baseURL: API_URL,
  headers: { Accept: 'application/json' },
  timeout: 15_000,
  ...(USE_SUPABASE_RPC ? { adapter: supabaseRpcAdapter } : {}),
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthenticated: (() => void) | null = null;
export function registerUnauthenticatedHandler(fn: () => void): void {
  onUnauthenticated = fn;
}

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401 && getToken()) {
      setToken(null);
      onUnauthenticated?.();
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: Record<string, string[]> };
}

/** Human-readable message from any failed request. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    const body = err.response?.data;
    if (body?.error?.details) {
      const first = Object.values(body.error.details)[0];
      if (first?.[0]) return first[0];
    }
    if (body?.error?.message) return body.error.message;
    if (err.code === 'ECONNABORTED') return 'The server took too long to respond.';
    if (!err.response) {
      return 'Cannot reach the server. Is the API running?';
    }
    if (!body || typeof body !== 'object' || !('success' in body)) {
      return `The API address answered with HTTP ${err.response.status} instead of JSON. Check your Supabase / API configuration.`;
    }
  }
  return fallback;
}

/** Field-level errors for forms. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (axios.isAxiosError<ApiErrorBody>(err) && err.response?.data?.error?.details) {
    return Object.fromEntries(Object.entries(err.response.data.error.details).map(([k, v]) => [k, v[0]]));
  }
  return {};
}

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get<{ data: T }>(url, { params });
  return res.data.data;
}

export async function getPaged<T>(url: string, params?: Record<string, unknown>): Promise<{ data: T[]; meta: import('./types').PageMeta }> {
  const res = await api.get<{ data: T[]; meta: import('./types').PageMeta }>(url, { params });
  return res.data;
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.post<{ data: T }>(url, body);
  return res.data.data;
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.patch<{ data: T }>(url, body);
  return res.data.data;
}

export async function del(url: string): Promise<void> {
  await api.delete(url);
}
