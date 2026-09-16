import axios, { AxiosError } from 'axios';

export const API_URL = `${(import.meta.env.VITE_API_URL as string | undefined) ?? ''}/api/v1`;

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

export const api = axios.create({
  baseURL: API_URL,
  headers: { Accept: 'application/json' },
  timeout: 15_000,
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
      return import.meta.env.PROD && !import.meta.env.VITE_API_URL
        ? 'API origin is not configured. Set VITE_API_URL on the hosting platform and redeploy.'
        : 'Cannot reach the server. Is the API running?';
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
