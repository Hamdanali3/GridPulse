<?php

namespace App\Services\Assistant\Tools;

use App\Models\Site;
use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\NavigateTargets;

final class NavigateTargetsTool extends AbstractTool
{
    public function name(): string
    {
        return 'navigate_targets';
    }

    public function description(): string
    {
        return 'Resolve a verified GridPulse frontend route + query string from the router whitelist for deep-linking.';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'intent' => [
                    'type' => 'string',
                    'enum' => ['overview', 'sites', 'site_detail', 'assets', 'alerts', 'work_orders', 'reports', 'team', 'audit', 'settings'],
                ],
                'params' => [
                    'type' => 'object',
                    'description' => 'Optional route query filters: site_id, site_name, type, types, technologies, status, severity, priority, from, to, overdue, mine, assignee_id, group_by, view, range, action, q, label',
                ],
            ],
            'required' => ['intent'],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        $intent = is_string($args['intent'] ?? null) ? $args['intent'] : '';
        $params = isset($args['params']) && is_array($args['params']) ? $args['params'] : $args;
        $validSiteIds = Site::query()->pluck('id')->map(fn ($id) => (int) $id)->all();

        $resolved = NavigateTargets::resolve($intent, $params, $ctx->role, $validSiteIds);
        if (! ($resolved['ok'] ?? false)) {
            return [
                'ok' => false,
                'forbidden' => (bool) ($resolved['forbidden'] ?? false),
                'code' => ($resolved['forbidden'] ?? false) ? 'FORBIDDEN' : 'INVALID_TARGET',
                'message' => $resolved['message'] ?? 'Invalid navigation target.',
            ];
        }

        return [
            'ok' => true,
            'link' => $resolved['link'],
        ];
    }
}
