<?php

namespace App\Services\Assistant;

use App\Models\AssistantUsage;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class AssistantRateLimiter
{
    /**
     * @return array{allowed: bool, count: int, limit: int, retry_after_seconds: int}
     */
    public function attempt(string $scope, string $identifier, int $maxRequests, int $windowSeconds = 300): array
    {
        $windowSec = max(10, $windowSeconds);
        $now = CarbonImmutable::now('UTC');
        $bucketEpoch = (int) (floor($now->timestamp / $windowSec) * $windowSec);
        $windowStart = CarbonImmutable::createFromTimestamp($bucketEpoch, 'UTC');

        // Opportunistic cleanup of stale buckets older than 2 days
        AssistantUsage::query()
            ->where('window_start', '<', $now->subDays(2)->toDateTimeString())
            ->delete();

        $count = DB::transaction(function () use ($scope, $identifier, $windowStart) {
            $bucket = AssistantUsage::query()
                ->where('scope', $scope)
                ->where('identifier', $identifier)
                ->where('window_start', $windowStart->toDateTimeString())
                ->first();

            if (! $bucket) {
                $bucket = AssistantUsage::query()->create([
                    'scope' => $scope,
                    'identifier' => $identifier,
                    'window_start' => $windowStart->toDateTimeString(),
                    'request_count' => 1,
                ]);

                return 1;
            }

            $bucket->increment('request_count');

            return (int) $bucket->fresh()->request_count;
        });

        $retryAfter = max(1, ($bucketEpoch + $windowSec) - $now->timestamp);

        return [
            'allowed' => $count <= $maxRequests,
            'count' => $count,
            'limit' => $maxRequests,
            'retry_after_seconds' => $retryAfter,
        ];
    }
}
