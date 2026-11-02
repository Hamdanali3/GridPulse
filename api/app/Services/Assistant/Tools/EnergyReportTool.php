<?php

namespace App\Services\Assistant\Tools;

use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\DateRangeResolver;
use App\Services\EnergyService;

final class EnergyReportTool extends AbstractTool
{
    public function __construct(private readonly EnergyService $energy) {}

    public function name(): string
    {
        return 'energy_report';
    }

    public function description(): string
    {
        return 'Aggregate energy generation (kWh and MWh) over a date range grouped by "site", "type" (technology), or "day" (reuses EnergyService).';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'range' => ['type' => 'string', 'description' => 'today, 7d, 30d'],
                'from' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                'to' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                'group_by' => ['type' => 'string', 'enum' => ['site', 'type', 'day']],
            ],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $win = DateRangeResolver::resolve($args, '7d');
        $rawGroup = strtolower(trim((string) ($args['group_by'] ?? 'site')));
        $groupBy = match ($rawGroup) {
            'technology', 'type' => 'type',
            'day', 'date' => 'day',
            default => 'site',
        };

        $rows = $this->energy->energy($win['from'], $win['to'], $groupBy);
        $totalKwh = round((float) collect($rows)->sum('kwh'), 1);

        return [
            'from' => $win['from']->toDateString(),
            'to' => $win['to']->toDateString(),
            'window_label' => $win['label'],
            'timezone' => 'Asia/Karachi',
            'group_by' => $groupBy,
            'total_kwh' => $totalKwh,
            'total_mwh' => round($totalKwh / 1000, 2),
            'rows' => array_slice($rows, 0, 25),
        ];
    }
}

