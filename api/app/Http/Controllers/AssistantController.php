<?php

namespace App\Http\Controllers;

use App\Models\AssistantLog;
use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\AssistantRateLimiter;
use App\Services\Assistant\AssistantService;
use App\Services\Assistant\KnowledgeBase;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AssistantController extends Controller
{
    public function __construct(
        private readonly AssistantService $assistant,
        private readonly AssistantRateLimiter $limiter,
    ) {}

    public function bootstrap(Request $request): JsonResponse
    {
        $ctx = AssistantContext::fromUser($request->user());

        return ApiResponse::ok($ctx->bootstrapPayload());
    }

    public function chat(Request $request): JsonResponse|StreamedResponse
    {
        // Identity & role ALWAYS come from the authenticated Sanctum token, never request payload.
        $ctx = AssistantContext::fromUser($request->user());

        $validated = $request->validate([
            'message' => ['required', 'string', 'min:1', 'max:1500'],
            'history' => ['sometimes', 'array', 'max:20'],
            'stream' => ['sometimes', 'boolean'],
        ]);

        $message = trim((string) $validated['message']);
        if ($message === '') {
            return ApiResponse::error(422, 'VALIDATION_ERROR', 'Please enter a question for PulseBot.');
        }

        $ipHash = substr(hash('sha256', 'gp-pulsebot:'.($request->ip() ?? '0.0.0.0')), 0, 32);
        $maxReq = max(1, (int) config('services.groq.session_rate_limit', 25));
        $winSec = max(10, (int) config('services.groq.rate_window_seconds', 300));

        $rl = $this->limiter->attempt('session', 'user:'.$ctx->userId, $maxReq, $winSec);
        if (! $rl['allowed']) {
            $this->assistant->writeLog($ctx->userId, $ctx->role, 'session', [], 0, 0, 'rate_limited', 'RATE_LIMITED', $ipHash);

            return ApiResponse::error(
                429,
                'RATE_LIMITED',
                "Rate limit reached ({$maxReq} questions per 5 minutes). Please wait {$rl['retry_after_seconds']}s and try again."
            )->header('Retry-After', (string) $rl['retry_after_seconds']);
        }

        $history = AssistantService::sanitizeHistory((array) ($validated['history'] ?? []), 8);
        $wantsStream = (bool) ($validated['stream'] ?? false)
            || str_contains((string) $request->header('Accept', ''), 'text/event-stream');

        if ($wantsStream) {
            return response()->stream(function () use ($ctx, $message, $history, $ipHash) {
                $emit = function (string $event, array $payload): void {
                    echo "event: {$event}\n";
                    echo 'data: '.json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n\n";
                    if (ob_get_level() > 0) {
                        @ob_flush();
                    }
                    flush();
                };

                $emit('status', ['phase' => 'thinking', 'message' => 'Checking session & planning queries…']);
                $result = $this->assistant->runSession($ctx, $message, $history, $ipHash, $emit);

                $emit('result', [
                    'response' => $result['response'],
                    'meta' => [
                        'role' => $ctx->role,
                        'tools_used' => $result['tools_used'],
                        'latency_ms' => $result['latency_ms'],
                    ],
                ]);
                $emit('done', (object) []);
            }, 200, [
                'Content-Type' => 'text/event-stream; charset=utf-8',
                'Cache-Control' => 'no-cache, no-transform',
                'Connection' => 'keep-alive',
                'X-Accel-Buffering' => 'no',
            ]);
        }

        $result = $this->assistant->runSession($ctx, $message, $history, $ipHash);

        return response()->json([
            'success' => true,
            'data' => $result['response'],
            'meta' => [
                'role' => $ctx->role,
                'tools_used' => $result['tools_used'],
                'latency_ms' => $result['latency_ms'],
            ],
        ]);
    }

    public function publicInfo(): JsonResponse
    {
        return ApiResponse::ok([
            'title' => 'Ask PulseBot about GridPulse',
            'subtitle' => 'Instant answers about our Chitral renewable fleet platform, roles, simulator, and architecture.',
            'suggestions' => KnowledgeBase::publicSuggestions(),
        ]);
    }

    public function publicChat(Request $request): JsonResponse|StreamedResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'min:1', 'max:600'],
            'history' => ['sometimes', 'array', 'max:10'],
            'stream' => ['sometimes', 'boolean'],
        ]);

        $message = trim((string) $validated['message']);
        if ($message === '' || preg_match('/(https?:\/\/\S+\s*){3,}/i', $message) || preg_match('/(.)\1{25,}/u', $message)) {
            return ApiResponse::error(422, 'VALIDATION_ERROR', 'Please ask a plain-text question about the GridPulse platform.');
        }

        $ipHash = substr(hash('sha256', 'gp-pulsebot:'.($request->ip() ?? '0.0.0.0')), 0, 32);
        $maxReq = max(1, (int) config('services.groq.public_rate_limit', 12));
        $winSec = max(10, (int) config('services.groq.rate_window_seconds', 300));

        $rl = $this->limiter->attempt('public', 'ip:'.$ipHash, $maxReq, $winSec);
        if (! $rl['allowed']) {
            $this->assistant->writeLog(null, 'public', 'public', [], 0, 0, 'rate_limited', 'RATE_LIMITED', $ipHash);

            return ApiResponse::error(
                429,
                'RATE_LIMITED',
                "Too many questions from this connection. Please wait {$rl['retry_after_seconds']}s or sign in to the demo."
            )->header('Retry-After', (string) $rl['retry_after_seconds']);
        }

        $history = AssistantService::sanitizeHistory((array) ($validated['history'] ?? []), 4);
        $wantsStream = (bool) ($validated['stream'] ?? false)
            || str_contains((string) $request->header('Accept', ''), 'text/event-stream');

        if ($wantsStream) {
            return response()->stream(function () use ($message, $history, $ipHash) {
                $emit = function (string $event, array $payload): void {
                    echo "event: {$event}\n";
                    echo 'data: '.json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n\n";
                    if (ob_get_level() > 0) {
                        @ob_flush();
                    }
                    flush();
                };

                $emit('status', ['phase' => 'thinking', 'message' => 'Searching project guide…']);
                $result = $this->assistant->runPublic($message, $history, $ipHash, $emit);

                $emit('result', [
                    'response' => $result['response'],
                    'meta' => ['latency_ms' => $result['latency_ms']],
                ]);
                $emit('done', (object) []);
            }, 200, [
                'Content-Type' => 'text/event-stream; charset=utf-8',
                'Cache-Control' => 'no-cache, no-transform',
                'Connection' => 'keep-alive',
                'X-Accel-Buffering' => 'no',
            ]);
        }

        $result = $this->assistant->runPublic($message, $history, $ipHash);

        return response()->json([
            'success' => true,
            'data' => $result['response'],
            'meta' => ['latency_ms' => $result['latency_ms']],
        ]);
    }

    public function logs(Request $request): JsonResponse
    {
        $limit = max(1, min(100, (int) $request->integer('limit', 30)));
        $paginator = AssistantLog::query()
            ->with('user')
            ->when($request->filled('surface'), fn ($q) => $q->where('surface', (string) $request->string('surface')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', (string) $request->string('status')))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($limit);

        return response()->json([
            'success' => true,
            'data' => collect($paginator->items())->map(fn (AssistantLog $log) => [
                'id' => $log->id,
                'user_id' => $log->user_id,
                'user_name' => $log->user?->name,
                'role' => $log->role,
                'surface' => $log->surface,
                'tools_used' => $log->tools_used ?? [],
                'tool_rounds' => $log->tool_rounds,
                'latency_ms' => $log->latency_ms,
                'status' => $log->status,
                'error_code' => $log->error_code,
                'created_at' => $log->created_at?->toISOString(),
            ])->values()->all(),
            'meta' => [
                'page' => $paginator->currentPage(),
                'limit' => $paginator->perPage(),
                'total' => $paginator->total(),
                'pages' => max(1, $paginator->lastPage()),
            ],
        ]);
    }
}
