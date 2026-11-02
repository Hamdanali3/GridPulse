<?php

namespace App\Services\Assistant\Tools;

use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\DateRangeResolver;
use App\Services\EnergyService;

final class GenerationTimeseriesTool extends AbstractTool
{
    public function __construct(private readonly EnergyService $energy) {}

    public function name(): string
    {
        return 'generation_timeseries';
    }

    public function description(): string
    {
        return 'Get generation timeseries over 24h, 3d, or 7d for the entire fleet, stacked by technology ("by_technology"), or for a single site.';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'scope' => ['type' => 'string', 'description' => '"fleet", "by_technology", or a site ID/name'],
                'site_id' => ['type' => 'integer'],
                'range' => ['type' => 'string', 'enum' => ['24h', '3d', '7d']],
                'granularity' => ['type' => 'string', 'enum' => ['auto', 'hour', 'day']],
            ],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $win = DateRangeResolver::resolve($args, '24h');
        $hoursSpan = max(1.0, $win['from']->diffInHours($win['to']));
        $gran = strtolower(trim((string) ($args['granularity'] ?? 'auto')));
        $bucketMin = match ($gran) {
            'hour', '1h', '60' => 60,
            'day', '1d', '1440' => 1440,
            default => $hoursSpan <= 36 ? 60 : ($hoursSpan <= 96 ? 180 : 360),
        };

        $scope = strtolower(trim((string) ($args['scope'] ?? 'fleet')));

        if (in_array($scope, ['by_type', 'by_technology', 'technology', 'type'], true)) {
            $points = array_slice($this->energy->seriesByType($win['from'], $bucketMin), -36);

            return [
                'scope' => 'by_technology',
                'window' => [
                    'from' => $win['from']->toDateString(),
                    'to' => $win['to']->toDateString(),
                    'label' => $win['label'],
                    'bucket_minutes' => $bucketMin,
                    'timezone' => 'Asia/Karachi',
                ],
                'unit' => 'kW',
                'points' => $points,
            ];
        }

        $site = null;
        if (! empty($args['site_id']) || ! empty($args['site']) || ! in_array($scope, ['', 'fleet'], true)) {
            $site = $this->resolveSite([
                'site_id' => $args['site_id'] ?? null,
                'site' => $args['site'] ?? $scope,
            ]);
        }

        $points = array_slice($this->energy->series($win['from'], $bucketMin, $site?->id, $site !== null), -36);

        return [
            'scope' => $site ? 'site' : 'fleet',
            'site_id' => $site?->id,
            'site_name' => $site?->name,
            'window' => [
                'from' => $win['from']->toDateString(),
                'to' => $win['to']->toDateString(),
                'label' => $win['label'],
                'bucket_minutes' => $bucketMin,
                'timezone' => 'Asia/Karachi',
            ],
            'unit' => 'kW',
            'points' => $points,
        ];
    }
}
