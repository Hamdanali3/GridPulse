<?php

namespace App\Services\Assistant\Tools;

use App\Models\User;
use App\Models\WorkOrder;
use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\DateRangeResolver;

final class WorkOrdersListTool extends AbstractTool
{
    public function name(): string
    {
        return 'work_orders_list';
    }

    public function description(): string
    {
        return 'List individual work orders ordered by priority (urgent first) and due_at (soonest/overdue first). Engineers default to own work orders unless scope="all".';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'range' => ['type' => 'string'],
                'technologies' => ['type' => 'array', 'items' => ['type' => 'string', 'enum' => ['hydro', 'solar', 'wind']]],
                'site_id' => ['type' => 'integer'],
                'site' => ['type' => 'string'],
                'status' => ['type' => 'string', 'enum' => ['planned', 'in_progress', 'blocked', 'done', 'open']],
                'priority' => ['type' => 'string', 'enum' => ['low', 'medium', 'high', 'urgent']],
                'assignee' => ['type' => 'string'],
                'overdue_only' => ['type' => 'boolean'],
                'scope' => ['type' => 'string', 'enum' => ['mine', 'all']],
                'limit' => ['type' => 'integer'],
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
        $status = strtolower(trim((string) ($args['status'] ?? '')));
        $priority = strtolower(trim((string) ($args['priority'] ?? '')));
        $scope = strtolower(trim((string) ($args['scope'] ?? '')));
        $overdueOnly = in_array($args['overdue_only'] ?? $args['overdue'] ?? false, [true, 1, '1', 'true'], true);
        $limit = max(1, min(15, (int) ($args['limit'] ?? 10)));

        $assigneeId = null;
        if (! empty($args['assignee_id']) && is_numeric($args['assignee_id'])) {
            $assigneeId = (int) $args['assignee_id'];
        } elseif (! empty($args['assignee']) && is_string($args['assignee'])) {
            $raw = trim($args['assignee']);
            if (in_array(strtolower($raw), ['me', 'mine', 'self'], true)) {
                $assigneeId = $ctx->userId;
            } elseif (ctype_digit($raw)) {
                $assigneeId = (int) $raw;
            } else {
                $assigneeId = User::query()->where('name', 'like', "%{$raw}%")->value('id');
            }
        } elseif ($ctx->role === 'engineer' && ! in_array($scope, ['all', 'fleet', 'site'], true)) {
            $assigneeId = $ctx->userId;
        }

        $now = now();
        $orders = WorkOrder::query()
            ->with(['site', 'asset', 'assignee'])
            ->when(! $win['is_all'], fn ($b) => $b->whereBetween('created_at', [$win['from'], $win['to']]))
            ->when($siteId !== null, fn ($b) => $b->where('site_id', $siteId))
            ->when(count($techs) > 0, fn ($b) => $b->whereHas('site', fn ($sq) => $sq->whereIn('type', $techs)))
            ->when($status === 'open', fn ($b) => $b->where('status', '!=', 'done'))
            ->when($status !== '' && $status !== 'open', fn ($b) => $b->where('status', $status))
            ->when($priority !== '', fn ($b) => $b->where('priority', $priority))
            ->when($assigneeId !== null, fn ($b) => $b->where('assignee_id', $assigneeId))
            ->when($overdueOnly, fn ($b) => $b->where('status', '!=', 'done')->whereNotNull('due_at')->where('due_at', '<', $now))
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC")
            ->orderByRaw('CASE WHEN due_at IS NULL THEN 1 ELSE 0 END ASC')
            ->orderBy('due_at')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        // Privacy rule (Section 9): never expose assignee email addresses to non-admins
        $rows = $orders->map(fn (WorkOrder $w) => [
            'id' => $w->id,
            'title' => $w->title,
            'priority' => $w->priority->value,
            'status' => $w->status->value,
            'site_id' => $w->site_id,
            'site_name' => $w->site?->name,
            'technology' => $w->site?->type?->value,
            'asset_name' => $w->asset?->name,
            'assignee_id' => $w->assignee_id,
            'assignee_name' => $w->assignee?->name ?? 'Unassigned',
            'due_at' => $w->due_at?->toISOString(),
            'is_overdue' => $w->status->value !== 'done' && $w->due_at !== null && $w->due_at->lt($now),
            'created_at' => $w->created_at?->toISOString(),
        ])->values()->all();

        return [
            'scope' => ($ctx->role === 'engineer' && $assigneeId === $ctx->userId) ? 'mine' : 'fleet',
            'count' => count($rows),
            'work_orders' => $rows,
        ];
    }
}

