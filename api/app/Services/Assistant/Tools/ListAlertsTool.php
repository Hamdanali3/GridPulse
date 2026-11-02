<?php

namespace App\Services\Assistant\Tools;

use App\Models\Alert;
use App\Services\Assistant\AssistantContext;

final class ListAlertsTool extends AbstractTool
{
    public function name(): string
    {
        return 'list_alerts';
    }

    public function description(): string
    {
        return 'Get capped list of individual alerts ordered by active status and severity (critical first).';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'status' => ['type' => 'string', 'enum' => ['open', 'acknowledged', 'resolved', 'active']],
                'severity' => ['type' => 'string', 'enum' => ['critical', 'warning', 'info']],
                'type' => ['type' => 'string', 'enum' => ['low_efficiency', 'high_temperature', 'asset_offline', 'zero_output']],
                'site_id' => ['type' => 'integer'],
                'site' => ['type' => 'string'],
                'technology' => ['type' => 'string', 'enum' => ['hydro', 'solar', 'wind']],
                'limit' => ['type' => 'integer'],
            ],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $site = $this->resolveSite($args);
        $siteId = $site?->id ?? (! empty($args['site_id']) ? (int) $args['site_id'] : null);
        $techs = $this->parseTechnologies($args);
        $status = strtolower(trim((string) ($args['status'] ?? '')));
        $severity = strtolower(trim((string) ($args['severity'] ?? '')));
        $type = strtolower(trim((string) ($args['type'] ?? '')));
        $limit = max(1, min(15, (int) ($args['limit'] ?? 10)));

        $alerts = Alert::query()
            ->with(['site', 'asset'])
            ->when($siteId !== null, fn ($b) => $b->where('site_id', $siteId))
            ->when(count($techs) > 0, fn ($b) => $b->whereHas('site', fn ($sq) => $sq->whereIn('type', $techs)))
            ->when($status === 'active', fn ($b) => $b->active())
            ->when($status !== '' && $status !== 'active', fn ($b) => $b->where('status', $status))
            ->when($severity !== '', fn ($b) => $b->where('severity', $severity))
            ->when($type !== '', fn ($b) => $b->where('type', $type))
            ->orderByRaw("CASE status WHEN 'open' THEN 2 WHEN 'acknowledged' THEN 1 ELSE 0 END DESC")
            ->orderByRaw("CASE severity WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END DESC")
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        $rows = $alerts->map(fn (Alert $a) => [
            'id' => $a->id,
            'type' => $a->type->value,
            'severity' => $a->severity->value,
            'status' => $a->status->value,
            'message' => $a->message,
            'value' => $a->value !== null ? (float) $a->value : null,
            'site_id' => $a->site_id,
            'site_name' => $a->site?->name,
            'technology' => $a->site?->type?->value,
            'asset_id' => $a->asset_id,
            'asset_name' => $a->asset?->name,
            'work_order_id' => $a->work_order_id,
            'created_at' => $a->created_at?->toISOString(),
        ])->values()->all();

        return [
            'count' => count($rows),
            'alerts' => $rows,
        ];
    }
}
