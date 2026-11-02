// GridPulse — `pulsebot` Supabase Edge Function (Authenticated Session Copilot)
// - Resolves identity & role strictly from the Authorization Bearer token via PostgreSQL (`gp_assistant_resolve_user`), NEVER from request body.
// - Enforces per-user rate limiting (`assistant_usage`), max message length, role-gated tools, and audit logging (`assistant_logs`).
// - Supports `GET` (role-aware bootstrap) and `POST` (SSE streaming or JSON response).

import { corsHeaders, extractClientIp, hashIp, isAllowedOrigin, jsonResponse } from '../_shared/cors.ts';
import {
  checkRateLimit,
  fetchAssistantBootstrap,
  resolveSessionContext,
  writeAssistantLog,
} from '../_shared/db.ts';
import { runSessionCopilot, sanitizeHistory } from '../_shared/groq.ts';

const MAX_MESSAGE_LENGTH = 1500;
const SESSION_RATE_WINDOW_SEC = 300; // 5 minutes
const SESSION_RATE_MAX = 25;         // 25 messages per 5 minutes per user

const encoder = new TextEncoder();
function sseChunk(event: string, payload: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin)) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (origin && !isAllowedOrigin(origin)) {
    return jsonResponse(
      { success: false, error: { code: 'FORBIDDEN_ORIGIN', message: 'Origin is not permitted.' } },
      403,
      origin,
    );
  }

  const authHeader = req.headers.get('authorization');

  // GET -> Role-specific welcome & starter prompts bootstrap
  if (req.method === 'GET') {
    try {
      const boot = await fetchAssistantBootstrap(authHeader);
      return jsonResponse(boot.body, boot.status, origin);
    } catch {
      return jsonResponse(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Unable to load assistant bootstrap.' } },
        500,
        origin,
      );
    }
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for bootstrap or POST for chat.' } },
      405,
      origin,
    );
  }

  const startedAt = Date.now();
  const ipHash = await hashIp(extractClientIp(req));

  // 1. Authenticate strictly from Authorization token (ignore any user_id/role in body)
  let ctx;
  try {
    ctx = await resolveSessionContext(authHeader);
  } catch {
    return jsonResponse(
      { success: false, error: { code: 'AUTH_UNAVAILABLE', message: 'Unable to verify session right now.' } },
      503,
      origin,
    );
  }

  if (!ctx.authenticated || !authHeader) {
    return jsonResponse(
      {
        success: false,
        error: {
          code: ctx.code ?? 'UNAUTHENTICATED',
          message: ctx.message ?? 'Sign in to use PulseBot.',
        },
      },
      ctx.status ?? 401,
      origin,
    );
  }

  // 2. Parse & validate request body
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    body = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return jsonResponse(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON request body.' } },
      400,
      origin,
    );
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return jsonResponse(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Please enter a question for PulseBot.' } },
      422,
      origin,
    );
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Message is too long (maximum ${MAX_MESSAGE_LENGTH} characters).`,
        },
      },
      422,
      origin,
    );
  }

  // 3. Per-user rate limit check
  const rl = await checkRateLimit('session', `user:${ctx.user_id}`, SESSION_RATE_WINDOW_SEC, SESSION_RATE_MAX);
  if (!rl.allowed) {
    await writeAssistantLog({
      userId: ctx.user_id,
      role: ctx.role,
      surface: 'session',
      toolsUsed: [],
      toolRounds: 0,
      latencyMs: Date.now() - startedAt,
      status: 'rate_limited',
      errorCode: 'RATE_LIMITED',
      ipHash,
    });
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit reached (${SESSION_RATE_MAX} questions per 5 minutes). Please wait ${rl.retry_after_seconds}s and try again.`,
        },
      },
      429,
      origin,
      { 'Retry-After': String(rl.retry_after_seconds) },
    );
  }

  const history = sanitizeHistory(body.history, 8);
  const accept = req.headers.get('accept') ?? '';
  const wantsStream = body.stream === true || accept.includes('text/event-stream');

  // 4A. SSE Streaming Mode
  if (wantsStream) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(sseChunk('status', { phase: 'thinking', message: 'Checking session & planning queries…' }));

          const result = await runSessionCopilot({
            ctx,
            authHeader,
            message,
            history,
            stream: true,
            callbacks: {
              onStatus: (phase, statusMsg, tool) => {
                controller.enqueue(sseChunk('status', { phase, message: statusMsg, ...(tool ? { tool } : {}) }));
              },
              onDelta: (text) => {
                controller.enqueue(sseChunk('delta', { text }));
              },
            },
          });

          const latencyMs = Date.now() - startedAt;
          await writeAssistantLog({
            userId: ctx.user_id,
            role: ctx.role,
            surface: 'session',
            toolsUsed: result.toolsUsed,
            toolRounds: result.toolRounds,
            latencyMs,
            status: result.status,
            errorCode: result.errorCode ?? null,
            ipHash,
          });

          controller.enqueue(
            sseChunk('result', {
              response: result.response,
              meta: {
                role: ctx.role,
                tools_used: result.toolsUsed,
                latency_ms: latencyMs,
              },
            }),
          );
          controller.enqueue(sseChunk('done', {}));
        } catch {
          controller.enqueue(
            sseChunk('error', {
              code: 'ASSISTANT_ERROR',
              message: 'PulseBot encountered a temporary issue. Please retry in a moment.',
            }),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // 4B. Standard JSON Mode
  const result = await runSessionCopilot({
    ctx,
    authHeader,
    message,
    history,
    stream: false,
  });

  const latencyMs = Date.now() - startedAt;
  await writeAssistantLog({
    userId: ctx.user_id,
    role: ctx.role,
    surface: 'session',
    toolsUsed: result.toolsUsed,
    toolRounds: result.toolRounds,
    latencyMs,
    status: result.status,
    errorCode: result.errorCode ?? null,
    ipHash,
  });

  return jsonResponse(
    {
      success: true,
      data: result.response,
      meta: {
        role: ctx.role,
        tools_used: result.toolsUsed,
        latency_ms: latencyMs,
      },
    },
    200,
    origin,
  );
});

