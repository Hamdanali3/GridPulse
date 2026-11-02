<?php

namespace App\Services\Assistant\Tools;

use App\Models\Alert;
use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\DateRangeResolver;

final class AlertsSummaryTool extends AbstractTool
{
    public function name(): string
    {
        return 'alerts_summary';
    }

    public function description(): string
    {
        return 'Get aggregated alert counts by status and severity, breakdown by rule type, oldest open alert, and Mean Time To Resolve (MTTR minutes).';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'range' => ['type' => 'string'],
                'site_id' => ['type' => 'integer'],
                'site' => ['type' => 'string'],
                'technology' => ['type' => 'string', 'enum' => ['hydro', 'solar', 'wind']],
                'severity' => ['type' => 'string', 'enum' => ['critical', 'warning', 'info']],
                'status' => ['type' => 'string', 'enum' => ['open', 'acknowledged', 'resolved']],
            ],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $win = DateRangeResolver::resolve($args, 'all');
        $site = $this->resolveSite($args);
        $siteId = $site?->id ?? (! empty($args['site_id']) ? (int) $args['site_id'] : null);
        $techs = $this->parseTechnologies($args);
        $severity = strtolower(trim((string) ($args['severity'] ?? '')));
        $status = strtolower(trim((string) ($args['status'] ?? '')));

        $alerts = Alert::query()
            ->with('site')
            ->when(! $win['is_all'], fn ($b) => $b->whereBetween('created_at', [$win['from'], $win['to']]))
            ->when($siteId !== null, fn ($b) => $b->where('site_id', $siteId))
            ->when(count($techs) > 0, fn ($b) => $b->whereHas('site', fn ($sq) => $sq->whereIn('type', $techs)))
            ->when($severity !== '', fn ($b) => $b->where('severity', $severity))
            ->when($status !== '', fn ($b) => $b->where('status', $status))
            ->get();

        $active = $alerts->filter(fn (Alert $a) => in_array($a->status->value, ['open', 'acknowledged'], true));
        $resolvedWithTime = $alerts->filter(fn (Alert $a) => $a->status->value === 'resolved' && $a->resolved_at !== null && $a->created_at !== null);

        $mttrMinutes = $resolvedWithTime->isNotEmpty()
            ? round((float) $resolvedWithTime->avg(fn (Alert $a) => max(0, $a->created_at->diffInSeconds($a->resolved_at) / 60)), 1)
            : null;

        $oldest = $active->sortBy('created_at')->first();

        return [
            'window' => ['label' => $win['label'], 'timezone' => 'Asia/Karachi'],
            'total' => $alerts->count(),
            'by_status' => [
                'open' => $alerts->filter(fn (Alert $a) => $a->status->value === 'open')->count(),
                'acknowledged' => $alerts->filter(fn (Alert $a) => $a->status->value === 'acknowledged')->count(),
                'resolved' => $alerts->filter(fn (Alert $a) => $a->status->value === 'resolved')->count(),
            ],
            'active_by_severity' => [
                'critical' => $active->filter(fn (Alert $a) => $a->severity->value === 'critical')->count(),
                'warning' => $active->filter(fn (Alert $a) => $a->severity->value === 'warning')->count(),
                'info' => $active->filter(fn (Alert $a) => $a->severity->value === 'info')->count(),
            ],
            'by_type' => $alerts->groupBy(fn (Alert $a) => $a->type->value)
                ->map(fn ($group, $type) => ['type' => $type, 'count' => $group->count()])
                ->sortByDesc('count')
                ->values()
                ->all(),
            'mttr_minutes' => $mttrMinutes,
            'oldest_open' => $oldest ? [
                'id' => $oldest->id,
                'severity' => $oldest->severity->value,
                'type' => $oldest->type->value,
                'message' => $oldest->message,
                'site_id' => $oldest->site_id,
                'site_name' => $oldest->site?->name,
                'created_at' => $oldest->created_at?->toISOString(),
            ] : null,
        ];
    }
}

