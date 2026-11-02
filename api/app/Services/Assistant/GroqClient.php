<?php

namespace App\Services\Assistant;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class GroqClient
{
    public function isConfigured(): bool
    {
        return trim((string) config('services.groq.api_key', '')) !== '';
    }

    public function model(): string
    {
        $model = trim((string) config('services.groq.model', 'llama-3.3-70b-versatile'));

        return $model !== '' ? $model : 'llama-3.3-70b-versatile';
    }

    /**
     * Calls Groq's OpenAI-compatible `/chat/completions` endpoint via Laravel's HTTP client
     * so `Http::fake()` works cleanly in automated tests.
     *
     * @param  list<array<string, mixed>>  $messages
     * @param  list<array<string, mixed>>|null  $tools
     * @return array<string, mixed>
     */
    public function chatCompletion(
        array $messages,
        ?array $tools = null,
        bool $jsonObjectMode = false,
        float $temperature = 0.1,
        int $maxTokens = 1600,
    ): array {
        $apiKey = trim((string) config('services.groq.api_key', ''));
        if ($apiKey === '') {
            throw new RuntimeException('GROQ_API_KEY is not configured.');
        }

        $baseUrl = rtrim((string) config('services.groq.base_url', 'https://api.groq.com/openai/v1'), '/');
        $timeout = max(5, (int) config('services.groq.timeout', 22));

        $payload = [
            'model' => $this->model(),
            'messages' => $messages,
            'temperature' => $temperature,
            'max_tokens' => $maxTokens,
        ];

        // Groq rejects requests that pass both `tools` and `response_format: json_object` simultaneously.
        if ($tools !== null && count($tools) > 0) {
            $payload['tools'] = $tools;
            $payload['tool_choice'] = 'auto';
        } elseif ($jsonObjectMode) {
            $payload['response_format'] = ['type' => 'json_object'];
        }

        $response = Http::baseUrl($baseUrl)
            ->withToken($apiKey)
            ->acceptJson()
            ->timeout($timeout)
            ->post('/chat/completions', $payload);

        if ($response->failed()) {
            $errCode = (string) ($response->json('error.code') ?? 'GROQ_HTTP_'.$response->status());
            $errMsg = (string) ($response->json('error.message') ?? 'Groq API request failed.');
            throw new RuntimeException("{$errCode}: {$errMsg}", $response->status());
        }

        return (array) $response->json();
    }
}

