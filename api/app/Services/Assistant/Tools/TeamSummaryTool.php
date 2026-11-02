<?php

namespace App\Services\Assistant\Tools;

use App\Models\User;
use App\Models\WorkOrder;
use App\Services\Assistant\AssistantContext;

final class TeamSummaryTool extends AbstractTool
{
    public function allowedRoles(): array
    {
        return ['admin'];
    }

    public function name(): string
    {
        return 'team_summary';
    }

    public function description(): string
    {
        return 'Admin-only: summarize GridPulse team members, roles, active status, last login, and open assigned work orders.';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => (object) [],
            'additionalProperties' => false,
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $users = User::query()->orderBy('role')->orderBy('name')->get();
        $openCounts = WorkOrder::query()
            ->where('status', '!=', 'done')
            ->selectRaw('assignee_id, COUNT(*) as c')
            ->groupBy('assignee_id')
            ->pluck('c', 'assignee_id');

        $members = $users->map(fn (User $u) => [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'role' => $u->role->value,
            'is_active' => (bool) $u->is_active,
            'last_login_at' => $u->last_login_at?->toISOString(),
            'open_work_orders' => (int) $openCounts->get($u->id, 0),
        ])->values()->all();

        return [
            'total' => $users->count(),
            'active' => $users->where('is_active', true)->count(),
            'inactive' => $users->where('is_active', false)->count(),
            'by_role' => $users->countBy(fn (User $u) => $u->role->value)->all(),
            'members' => array_slice($members, 0, 25),
        ];
    }
}

