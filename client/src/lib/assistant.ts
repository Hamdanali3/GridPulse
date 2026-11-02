import {
  API_URL,
  CUSTOM_API_ORIGIN,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  USE_SUPABASE_RPC,
  get,
  getToken,
} from './api';
import type { Role, User } from './types';

export interface AssistantKpi {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  trend?: 'up' | 'down' | 'flat' | 'neutral';
}

export interface ChartSeriesItem {
  key: string;
  label: string;
  color?: string;
}

export interface ChartVisual {
  type: 'bar' | 'line' | 'area' | 'stacked_bar' | 'pie' | 'progress';
  title: string;
  x: string;
  series: ChartSeriesItem[];
  data: Array<Record<string, string | number | null>>;
  unit?: string;
}

export interface TableVisual {
  type: 'table';
  columns: string[];
  rows: Array<Array<string | number>>;
  caption: string;
}

export type AssistantVisual = ChartVisual | TableVisual;

export interface DeepLink {
  label: string;
  route: string;
  query?: Record<string, string>;
}

export interface SessionAssistantResponse {
  summary: string;
  kpis: AssistantKpi[];
  visuals: AssistantVisual[];
  insights: string[];
  links: DeepLink[];
  followups: string[];
  confidence_notes?: string;
}

export interface PublicAssistantResponse {
  summary: string;
  bullets: string[];
  links: DeepLink[];
  followups: string[];
  refused?: boolean;
}

export interface AssistantBootstrap {
  user_id: number;
  name: string;
  role: Role;
  permissions: string[];
  today: string;
  timezone: string;
  welcome: string;
  starters: string[];
}

export interface ChatTurnHistory {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  statusText?: string;
  streaming?: boolean;
  response?: SessionAssistantResponse;
  toolsUsed?: string[];
  latencyMs?: number;
  error?: string;
  retryPrompt?: string;
}

export const PUBLIC_STARTER_QUESTIONS = [
  'What is GridPulse and what problem does it solve in Chitral?',
  'How do alerts automatically become work orders?',
  'What can Admin, Engineer, and Viewer roles do?',
  'How is live solar, hydro, and wind telemetry simulated?',
  'How can I try the live demo accounts?',
  'Who built GridPulse and what tech stack powers it?',
];

export function buildDeepLinkPath(link: DeepLink): string {
  if (!link.query || Object.keys(link.query).length === 0) {
    return link.route;
  }
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(link.query)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      sp.set(k, String(v));
    }
  }
  const qs = sp.toString();
  return qs ? `${link.route}?${qs}` : link.route;
}

export function fallbackBootstrapForUser(user: User): AssistantBootstrap {
  const startersByRole: Record<Role, { welcome: string; starters: string[] }> = {
    admin: {
      welcome: `Welcome back, ${user.name}. As Operations Chief-of-Staff, I can summarize fleet output, engineer workloads, completion rates, critical alerts, team roles, and audit activity.`,
      starters: [
        'How much work did we give engineers in the last 7 days across all hydro plants and solar fields, and how much is done?',
        'Show overdue work orders and which sites are most affected',
        'What is fleet output today and capacity factor by technology?',
        'Summarize open critical alerts right now',
        'Who changed what in the audit log over the last 7 days?',
      ],
    },
    engineer: {
      welcome: `Hi ${user.name}. As your Field-Ops Co-Pilot, I default to your assigned work orders and active site alerts to help you prioritize field checks.`,
      starters: [
        'What should I fix first across my assigned work orders and alerts?',
        'Show my open and overdue work orders',
        'Summarize active critical and warning alerts across sites',
        'Which generating units have the lowest health score right now?',
        'Explain how low-efficiency and high-temperature alerts trigger',
      ],
    },
    viewer: {
      welcome: `Hello ${user.name}. I can report live fleet generation, plant availability, 7-day energy trends, and explain renewable-operations metrics in plain language.`,
      starters: [
        'What is the fleet output and capacity factor right now?',
        'Which plants are producing least today?',
        'Show 7-day energy generation grouped by technology',
        'Which sites are degraded, offline, or in maintenance?',
        'What does capacity factor mean vs availability?',
      ],
    },
  };

  const preset = startersByRole[user.role] ?? startersByRole.viewer;
  return {
    user_id: user.id,
    name: user.name,
    role: user.role,
    permissions: [],
    today: new Date().toISOString().slice(0, 10),
    timezone: 'Asia/Karachi',
    welcome: preset.welcome,
    starters: preset.starters,
  };
}

export async function fetchAssistantBootstrap(user: User): Promise<AssistantBootstrap> {
  try {
    return await get<AssistantBootstrap>('/assistant/bootstrap');
  } catch {
    if (USE_SUPABASE_RPC) {
      try {
        const token = getToken();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/pulsebot`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            apikey: SUPABASE_ANON_KEY,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const json = (await res.json()) as { success?: boolean; data?: AssistantBootstrap };
          if (json?.success && json.data) return json.data;
        }
      } catch {
        // Fall through to deterministic role starter pack
      }
    }
    return fallbackBootstrapForUser(user);
  }
}

function sessionEndpoint(): { url: string; headers: Record<string, string> } {
  const token = getToken();
  if (USE_SUPABASE_RPC && !CUSTOM_API_ORIGIN) {
    return {
      url: `${SUPABASE_URL}/functions/v1/pulsebot`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        apikey: SUPABASE_ANON_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  }

  return {
    url: `${API_URL}/assistant/chat`,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

function publicEndpoint(): { url: string; headers: Record<string, string> } {
  if (USE_SUPABASE_RPC && !CUSTOM_API_ORIGIN) {
    return {
      url: `${SUPABASE_URL}/functions/v1/pulsebot-public`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        apikey: SUPABASE_ANON_KEY,
      },
    };
  }

  return {
    url: `${API_URL}/assistant/public`,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
  };
}

interface SseHandlers<T> {
  onStatus?: (message: string, phase?: string) => void;
  onDelta?: (deltaText: string) => void;
  signal?: AbortSignal;
  parseResult?: (raw: unknown) => { response: T; toolsUsed?: string[]; latencyMs?: number };
}

async function consumeAssistantStream<T>(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  handlers: SseHandlers<T>,
): Promise<{ response: T; toolsUsed: string[]; latencyMs?: number }> {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, stream: true }),
    signal: handlers.signal,
  });

  const contentType = res.headers.get('content-type') ?? '';

  if (!res.ok) {
    let friendly = 'PulseBot is temporarily unavailable. Please try again in a moment.';
    try {
      const errJson = (await res.json()) as { error?: { message?: string }; message?: string };
      friendly = errJson?.error?.message || errJson?.message || friendly;
    } catch {
      if (res.status === 429) {
        friendly = 'Too many questions right now. Please wait a few seconds and retry.';
      } else if (res.status === 401) {
        friendly = 'Your session expired. Please sign in again.';
      }
    }
    throw new Error(friendly);
  }

  // Handle standard JSON response fallback seamlessly
  if (contentType.includes('application/json') || !res.body) {
    const json = (await res.json()) as {
      success?: boolean;
      data?: T;
      meta?: { tools_used?: string[]; latency_ms?: number };
      error?: { message?: string };
    };
    if (!json.success || !json.data) {
      throw new Error(json.error?.message || 'Unable to complete your request right now.');
    }
    return {
      response: json.data,
      toolsUsed: json.meta?.tools_used ?? [],
      latencyMs: json.meta?.latency_ms,
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: { response: T; toolsUsed: string[]; latencyMs?: number } | null = null;
  let streamError: string | null = null;

  const processEventBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join('\n');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawData) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === 'status') {
      const msg = typeof parsed.message === 'string' ? parsed.message : 'Working…';
      const phase = typeof parsed.phase === 'string' ? parsed.phase : undefined;
      handlers.onStatus?.(msg, phase);
    } else if (eventName === 'delta') {
      const text = typeof parsed.text === 'string' ? parsed.text : '';
      if (text) handlers.onDelta?.(text);
    } else if (eventName === 'result') {
      const meta = (parsed.meta as Record<string, unknown> | undefined) ?? {};
      finalResult = {
        response: parsed.response as T,
        toolsUsed: Array.isArray(meta.tools_used) ? (meta.tools_used as string[]) : [],
        latencyMs: typeof meta.latency_ms === 'number' ? meta.latency_ms : undefined,
      };
    } else if (eventName === 'error') {
      streamError = typeof parsed.message === 'string' ? parsed.message : 'PulseBot encountered a temporary error.';
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sepIndex).trim();
      buffer = buffer.slice(sepIndex + 2);
      if (block) processEventBlock(block);
    }
  }

  if (buffer.trim()) {
    processEventBlock(buffer.trim());
  }

  if (streamError) {
    throw new Error(streamError);
  }
  if (!finalResult) {
    throw new Error('PulseBot stream ended unexpectedly. Please click Retry.');
  }

  return finalResult;
}

export async function streamSessionChat(params: {
  message: string;
  history: ChatTurnHistory[];
  onStatus?: (message: string, phase?: string) => void;
  onDelta?: (deltaText: string) => void;
  signal?: AbortSignal;
}): Promise<{ response: SessionAssistantResponse; toolsUsed: string[]; latencyMs?: number }> {
  const { url, headers } = sessionEndpoint();
  return consumeAssistantStream<SessionAssistantResponse>(
    url,
    headers,
    { message: params.message, history: params.history },
    {
      onStatus: params.onStatus,
      onDelta: params.onDelta,
      signal: params.signal,
    },
  );
}

export async function streamPublicChat(params: {
  message: string;
  history: ChatTurnHistory[];
  onStatus?: (message: string, phase?: string) => void;
  onDelta?: (deltaText: string) => void;
  signal?: AbortSignal;
}): Promise<{ response: PublicAssistantResponse; latencyMs?: number }> {
  const { url, headers } = publicEndpoint();
  const res = await consumeAssistantStream<PublicAssistantResponse>(
    url,
    headers,
    { message: params.message, history: params.history },
    {
      onStatus: params.onStatus,
      onDelta: params.onDelta,
      signal: params.signal,
    },
  );
  return { response: res.response, latencyMs: res.latencyMs };
}

// Session-scoped chat storage keyed strictly by authenticated user ID (never shared across users)
function storageKey(userId: number): string {
  return `gp_pulsebot_chat_u${userId}`;
}

export function loadSessionMessages(userId: number): SessionChatMessage[] {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-30) as SessionChatMessage[];
  } catch {
    return [];
  }
}

export function saveSessionMessages(userId: number, messages: SessionChatMessage[]): void {
  try {
    const serializable = messages
      .filter((m) => !m.streaming)
      .slice(-30);
    sessionStorage.setItem(storageKey(userId), JSON.stringify(serializable));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearSessionMessages(userId: number): void {
  try {
    sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Ignore
  }
}
