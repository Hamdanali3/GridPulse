<?php

namespace App\Services\Assistant\Tools;

use App\Models\User;
use App\Models\WorkOrder;
use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\DateRangeResolver;

final class EngineerWorkloadTool extends AbstractTool
{
    public function allowedRoles(): array
    {
        return ['admin', 'engineer'];
    }

    public function name(): string
    {
        return 'engineer_workload';
    }

    public function description(): string
    {
        return 'Compare assigned, done, in_progress, blocked, overdue, and completion_pct per engineer over a date window. Admin sees any/all engineers; Engineer sees self only.';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'assignee' => ['type' => 'string', 'description' => 'Optional engineer name or ID'],
                'range' => ['type' => 'string', 'description' => '7d, 30d, or all'],
            ],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $win = DateRangeResolver::resolve($args, '7d');
        $rawAssignee = trim((string) ($args['assignee'] ?? ''));

        $targetUserId = null;
        if ($ctx->role === 'engineer') {
            if ($rawAssignee !== '' && ! in_array(strtolower($rawAssignee), ['me', 'mine', 'self', strtolower($ctx->name), (string) $ctx->userId], true)
                && stripos($ctx->name, $rawAssignee) === false) {
                return [
                    'forbidden' => true,
                    'code' => 'FORBIDDEN',
                    'required_roles' => ['admin'],
                    'message' => 'Engineers can only inspect their own personal workload. Fleet-wide engineer HR workload comparisons require the Admin role.',
                ];
            }
            $targetUserId = $ctx->userId;
        } elseif ($rawAssignee !== '') {
            if (ctype_digit($rawAssignee)) {
                $targetUserId = (int) $rawAssignee;
            } else {
                $targetUserId = User::query()->where('name', 'like', "%{$rawAssignee}%")->value('id');
            }
        }

        $users = User::query()
            ->whereIn('role', ['engineer', 'admin'])
            ->when($targetUserId !== null, fn ($b) => $b->where('id', $targetUserId))
            ->orderBy('name')
            ->get();

        $orders = WorkOrder::query()
            ->when(! $win['is_all'], fn ($b) => $b->whereBetween('created_at', [$win['from'], $win['to']]))
            ->whereIn('assignee_id', $users->pluck('id')->all())
            ->get()
            ->groupBy('assignee_id');

        $now = now();
        $rows = $users->map(function (User $u) use ($orders, $now, $ctx) {
            $group = $orders->get($u->id, collect());
            if ($ctx->role !== 'engineer' && $u->role->value === 'admin' && $group->isEmpty()) {
                return null;
            }
            $total = $group->count();
            $done = $group->filter(fn (WorkOrder $w) => $w->status->value === 'done')->count();

            $entry = [
                'user_id' => $u->id,
                'name' => $u->name,
                'role' => $u->role->value,
                'assigned' => $total,
                'planned' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'planned')->count(),
                'in_progress' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'in_progress')->count(),
                'blocked' => $group->filter(fn (WorkOrder $w) => $w->status->value === 'blocked')->count(),
                'done' => $done,
                'overdue' => $group->filter(fn (WorkOrder $w) => $w->status->value !== 'done' && $w->due_at !== null && $w->due_at->lt($now))->count(),
                'completion_pct' => $total > 0 ? round($done / $total * 100, 1) : 0.0,
            ];

            if ($ctx->role === 'admin') {
                $entry['email'] = $u->email;
            }

            return $entry;
        })->filter()->sortByDesc('assigned')->values()->all();

        return [
            'window' => [
                'from' => $win['from']->toDateString(),
                'to' => $win['to']->toDateString(),
                'label' => $win['label'],
                'timezone' => 'Asia/Karachi',
            ],
            'scope' => $ctx->role === 'engineer' ? 'self' : 'fleet',
            'engineers' => $rows,
        ];
    }
}
