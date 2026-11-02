<?php

namespace App\Services\Assistant\Tools;

use App\Models\AuditLog;
use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\DateRangeResolver;

final class AuditLogSearchTool extends AbstractTool
{
    public function allowedRoles(): array
    {
        return ['admin'];
    }

    public function name(): string
    {
        return 'audit_log_search';
    }

    public function description(): string
    {
        return 'Admin-only: search immutable audit trail of sign-ins, role updates, alert handling, and entity changes.';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'range' => ['type' => 'string'],
                'action' => ['type' => 'string'],
                'entity_type' => ['type' => 'string'],
                'actor' => ['type' => 'string'],
                'q' => ['type' => 'string'],
                'limit' => ['type' => 'integer'],
            ],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $win = DateRangeResolver::resolve($args, '7d');
        $action = trim((string) ($args['action'] ?? ''));
        $entityType = trim((string) ($args['entity_type'] ?? ''));
        $actor = trim((string) ($args['actor'] ?? ''));
        $q = trim((string) ($args['q'] ?? ''));
        $limit = max(1, min(20, (int) ($args['limit'] ?? 15)));

        $query = AuditLog::query()
            ->with('actor')
            ->when(! $win['is_all'], fn ($b) => $b->whereBetween('created_at', [$win['from'], $win['to']]))
            ->when($action !== '', fn ($b) => $b->where('action', 'like', "%{$action}%"))
            ->when($entityType !== '', fn ($b) => $b->where('entity_type', $entityType))
            ->when($actor !== '', function ($b) use ($actor) {
                if (ctype_digit($actor)) {
                    $b->where('actor_id', (int) $actor);
                } else {
                    $b->whereHas('actor', fn ($aq) => $aq->where('name', 'like', "%{$actor}%"));
                }
            })
            ->when($q !== '', fn ($b) => $b->where(function ($sub) use ($q) {
                $sub->where('action', 'like', "%{$q}%")
                    ->orWhere('entity_type', 'like', "%{$q}%")
                    ->orWhereHas('actor', fn ($aq) => $aq->where('name', 'like', "%{$q}%"));
            }));

        $allMatching = (clone $query)->get();
        $entries = $query->orderByDesc('created_at')->orderByDesc('id')->limit($limit)->get();

        return [
            'window' => [
                'from' => $win['from']->toDateString(),
                'to' => $win['to']->toDateString(),
                'label' => $win['label'],
                'timezone' => 'Asia/Karachi',
            ],
            'count' => $allMatching->count(),
            'by_action' => $allMatching->groupBy('action')
                ->map(fn ($g, $act) => ['action' => $act, 'count' => $g->count()])
                ->sortByDesc('count')
                ->values()
                ->take(10)
                ->all(),
            'entries' => $entries->map(fn (AuditLog $l) => [
                'id' => $l->id,
                'action' => $l->action,
                'entity_type' => $l->entity_type,
                'entity_id' => $l->entity_id,
                'actor_name' => $l->actor?->name ?? 'System',
                'actor_email' => $l->actor?->email,
                'meta' => $l->meta,
                'created_at' => $l->created_at?->toISOString(),
            ])->values()->all(),
        ];
    }
}
