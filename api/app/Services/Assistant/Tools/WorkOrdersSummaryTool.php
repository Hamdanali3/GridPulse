<?php

namespace App\Services\Assistant\Tools;

use App\Models\User;
use App\Models\WorkOrder;
use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\DateRangeResolver;

final class WorkOrdersSummaryTool extends AbstractTool
{
    public function name(): string
    {
        return 'work_orders_summary';
    }

    public function description(): string
    {
        return 'Compute aggregates of work orders in a date window: total, planned, in_progress, blocked, done, completion_pct, overdue, plus breakdowns by_assignee, by_site, by_technology, and by_priority. Engineers default to own items unless scope="all".';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'range' => ['type' => 'string', 'description' => 'Window such as "7d", "30d", "today", "all"'],
                'from' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                'to' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                'technologies' => [
                    'type' => 'array',
                    'items' => ['type' => 'string', 'enum' => ['hydro', 'solar', 'wind']],
                ],
                'technology' => ['type' => 'string', 'enum' => ['hydro', 'solar', 'wind']],
                'site_id' => ['type' => 'integer'],
                'site' => ['type' => 'string'],
                'status' => ['type' => 'string', 'enum' => ['planned', 'in_progress', 'blocked', 'done']],
                'priority' => ['type' => 'string', 'enum' => ['low', 'medium', 'high', 'urgent']],
                'assignee' => ['type' => 'string'],
                'scope' => ['type' => 'string', 'enum' => ['mine', 'all']],
            ],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $win = DateRangeResolver::resolve($args, '7d');
        $site = $this->resolveSite($args);
        $siteId = $site?->id ?? (! empty($args['site_id']) ? (int) $args['site_id'] : null);
        $techs = $this->parseTechnologies($args);
        $status = strtolower(trim((string) ($args['status'] ?? '')));
        $priority = strtolower(trim((string) ($args['priority'] ?? '')));
        $scope = strtolower(trim((string) ($args['scope'] ?? '')));

        $assigneeId = $this->resolveAssigneeId($args, $ctx, $scope);

        $orders = WorkOrder::query()
            ->with(['site', 'assignee'])
            ->when(! $win['is_all'], fn ($b) => $b->whereBetween('created_at', [$win['from'], $win['to']]))
            ->when($siteId !== null, fn ($b) => $b->where('site_id', $siteId))
            ->when(count($techs) > 0, fn ($b) => $b->whereHas('site', fn ($sq) => $sq->whereIn('type', $techs)))
            ->when($status !== '', fn ($b) => $b->where('status', $status))
            ->when($priority !== '', fn ($b) => $b->where('priority', $priority))
            ->when($assigneeId !== null, fn ($b) => $b->where('assignee_id', $assigneeId))
            ->get();

        $now = now();
        $total = $orders->count();
        $planned = $orders->filter(fn (WorkOrder $w) => $w->status->value === 'planned')->count();
        $inProgress = $orders->filter(fn (WorkOrder $w) => $w->status->value === 'in_progress')->count();
        $blocked = $orders->filter(fn (WorkOrder $w) => $w->status->value === 'blocked')->count();
        $done = $orders->filter(fn (WorkOrder $w) => $w->status->value === 'done')->count();
        $overdue = $orders->filter(fn (WorkOrder $w) => $w->status->value !== 'done' && $w->due_at !== null && $w->due_at->lt($now))->count();

        $byAssignee = $orders
            ->groupBy(fn (WorkOrder $w) => (string) ($w->assignee_id ?? 'unassigned'))
            ->map(function ($group) use ($now) {
                /** @var WorkOrder $first */
                $first = $group->first();
                $gTotal = $group->count();
                $gDone = $group->filter(fn (WorkOrder $w) => $w->status->value === 'done')->count();

                return [
                    'assignee_id' => $first->assignee_id,
                    'assignee' => $first->assignee?->name ?? 'Unassigned',
                    'total' => $gTotal,
                    'planned' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'planned')->count(),
                    'in_progress' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'in_progress')->count(),
                    'blocked' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'blocked')->count(),
                    'done' => $gDone,
                    'overdue' => $group->filter(fn (WorkOrder $w) => $w->status->value !== 'done' && $w->due_at !== null && $w->due_at->lt($now))->count(),
                    'completion_pct' => $gTotal > 0 ? round($gDone / $gTotal * 100, 1) : 0.0,
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->take(12)
            ->all();

        $bySite = $orders
            ->groupBy('site_id')
            ->map(function ($group) use ($now) {
                /** @var WorkOrder $first */
                $first = $group->first();

                return [
                    'site_id' => $first->site_id,
                    'site' => $first->site?->name ?? "Site #{$first->site_id}",
                    'technology' => $first->site?->type?->value,
                    'total' => $group->count(),
                    'done' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'done')->count(),
                    'overdue' => $group->filter(fn (WorkOrder $w) => $w->status->value !== 'done' && $w->due_at !== null && $w->due_at->lt($now))->count(),
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->take(10)
            ->all();

        $byTechnology = $orders
            ->groupBy(fn (WorkOrder $w) => $w->site?->type?->value ?? 'unknown')
            ->map(fn ($group, $tech) => [
                'technology' => $tech,
                'total' => $group->count(),
                'done' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'done')->count(),
                'in_progress' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'in_progress')->count(),
                'planned' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'planned')->count(),
                'blocked' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'blocked')->count(),
            ])
            ->sortByDesc('total')
            ->values()
            ->all();

        $byPriority = $orders
            ->groupBy(fn (WorkOrder $w) => $w->priority->value)
            ->map(fn ($group, $prio) => ['priority' => $prio, 'count' => $group->count()])
            ->values()
            ->all();

        return [
            'window' => [
                'from' => $win['from']->toDateString(),
                'to' => $win['to']->toDateString(),
                'label' => $win['label'],
                'timezone' => 'Asia/Karachi',
            ],
            'scope' => ($ctx->role === 'engineer' && $assigneeId === $ctx->userId) ? 'mine' : 'fleet',
            'technologies_filter' => count($techs) > 0 ? $techs : ['hydro', 'solar', 'wind'],
            'total' => $total,
            'by_status' => [
                'planned' => $planned,
                'in_progress' => $inProgress,
                'blocked' => $blocked,
                'done' => $done,
            ],
            'completion_pct' => $total > 0 ? round($done / $total * 100, 1) : 0.0,
            'overdue' => $overdue,
            'by_assignee' => $byAssignee,
            'by_site' => $bySite,
            'by_technology' => $byTechnology,
            'by_priority' => $byPriority,
        ];
    }

    /** @param array<string, mixed> $args */
    private function resolveAssigneeId(array $args, AssistantContext $ctx, string $scope): ?int
    {
        if (! empty($args['assignee_id']) && is_numeric($args['assignee_id'])) {
            return (int) $args['assignee_id'];
        }

        $rawAssignee = trim((string) ($args['assignee'] ?? ''));
        if ($rawAssignee !== '') {
            if (in_array(strtolower($rawAssignee), ['me', 'mine', 'self'], true)) {
                return $ctx->userId;
            }
            if (ctype_digit($rawAssignee)) {
                return (int) $rawAssignee;
            }
            $user = User::query()->where('name', 'like', "%{$rawAssignee}%")->orderBy('id')->first();
            if ($user) {
                return (int) $user->id;
            }
        }

        // Engineer defaults to own assigned work orders unless scope="all"
        if ($ctx->role === 'engineer' && ! in_array($scope, ['all', 'fleet', 'site'], true)) {
            return $ctx->userId;
        }

        return null;
    }
}

