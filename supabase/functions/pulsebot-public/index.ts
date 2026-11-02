// GridPulse — `pulsebot-public` Supabase Edge Function (Public Homepage Info Box)
// - Public endpoint (`verify_jwt = false` in `supabase/config.toml`).
// - ZERO access to private operational tables, ZERO tools, ZERO service-role key usage.
// - Answers strictly from curated `_shared/knowledge.ts`, politely refuses live operational or off-topic queries,
//   and enforces strict per-IP rate limiting + max message length.

import { corsHeaders, extractClientIp, hashIp, isAllowedOrigin, jsonResponse } from '../_shared/cors.ts';
import { checkRateLimit, writeAssistantLog } from '../_shared/db.ts';
import { runPublicGuide, sanitizeHistory } from '../_shared/groq.ts';

const MAX_PUBLIC_MESSAGE_LENGTH = 600;
const PUBLIC_RATE_WINDOW_SEC = 300; // 5 minutes
const PUBLIC_RATE_MAX = 12;         // Stricter per-IP limit: 12 queries per 5 minutes

export const PUBLIC_SUGGESTED_QUESTIONS = [
  'What is GridPulse and what problem does it solve in Chitral?',
  'How do alerts automatically become work orders?',
  'What can Admin, Engineer, and Viewer roles do?',
  'How is live solar, hydro, and wind telemetry simulated?',
  'How can I try the live demo accounts?',
  'Who built GridPulse and what tech stack powers it?',
];

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

  if (req.method === 'GET') {
    return jsonResponse(
      {
        success: true,
        data: {
          title: 'Ask PulseBot about GridPulse',
          subtitle: 'Instant answers about our Chitral renewable fleet platform, roles, simulator, and architecture.',
          suggestions: PUBLIC_SUGGESTED_QUESTIONS,
        },
      },
      200,
      origin,
    );
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to ask a question.' } },
      405,
      origin,
    );
  }

  const startedAt = Date.now();
  const ipHash = await hashIp(extractClientIp(req));

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
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Please enter a question about GridPulse.' } },
      422,
      origin,
    );
  }
  if (message.length > MAX_PUBLIC_MESSAGE_LENGTH) {
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Question is too long (maximum ${MAX_PUBLIC_MESSAGE_LENGTH} characters).`,
        },
      },
      422,
      origin,
    );
  }

  // Basic abuse check (excessive repeated characters / URL spam)
  if (/(https?:\/\/\S+\s*){3,}/i.test(message) || /(.)\1{25,}/.test(message)) {
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please ask a plain-text question about the GridPulse platform.',
        },
      },
      422,
      origin,
    );
  }

  const rl = await checkRateLimit('public', `ip:${ipHash}`, PUBLIC_RATE_WINDOW_SEC, PUBLIC_RATE_MAX);
  if (!rl.allowed) {
    await writeAssistantLog({
      userId: null,
      role: 'public',
      surface: 'public',
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
          message: `Too many questions from this connection. Please wait ${rl.retry_after_seconds}s or sign in to the demo.`,
        },
      },
      429,
      origin,
      { 'Retry-After': String(rl.retry_after_seconds) },
    );
  }

  const history = sanitizeHistory(body.history, 4);
  const accept = req.headers.get('accept') ?? '';
  const wantsStream = body.stream === true || accept.includes('text/event-stream');

  if (wantsStream) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(sseChunk('status', { phase: 'thinking', message: 'Searching project guide…' }));

          const result = await runPublicGuide({
            message,
            history,
            stream: true,
            callbacks: {
              onStatus: (phase, statusMsg) => {
                controller.enqueue(sseChunk('status', { phase, message: statusMsg }));
              },
              onDelta: (text) => {
                controller.enqueue(sseChunk('delta', { text }));
              },
            },
          });

          const latencyMs = Date.now() - startedAt;
          await writeAssistantLog({
            userId: null,
            role: 'public',
            surface: 'public',
            toolsUsed: [],
            toolRounds: 0,
            latencyMs,
            status: result.status,
            errorCode: result.errorCode ?? null,
            ipHash,
          });

          controller.enqueue(
            sseChunk('result', {
              response: result.response,
              meta: { latency_ms: latencyMs },
            }),
          );
          controller.enqueue(sseChunk('done', {}));
        } catch {
          controller.enqueue(
            sseChunk('error', {
              code: 'ASSISTANT_ERROR',
              message: 'Unable to answer right now. Try signing in with a demo account on /login.',
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

  const result = await runPublicGuide({
    message,
    history,
    stream: false,
  });

  const latencyMs = Date.now() - startedAt;
  await writeAssistantLog({
    userId: null,
    role: 'public',
    surface: 'public',
    toolsUsed: [],
    toolRounds: 0,
    latencyMs,
    status: result.status,
    errorCode: result.errorCode ?? null,
    ipHash,
  });

  return jsonResponse(
    {
      success: true,
      data: result.response,
      meta: { latency_ms: latencyMs },
    },
    200,
    origin,
  );
});
