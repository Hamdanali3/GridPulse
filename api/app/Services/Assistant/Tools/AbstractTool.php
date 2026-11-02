<?php

namespace App\Services\Assistant\Tools;

use App\Models\Site;
use App\Services\Assistant\AssistantContext;

abstract class AbstractTool implements ToolInterface
{
    public function allowedRoles(): array
    {
        return ['admin', 'engineer', 'viewer'];
    }

    /**
     * Returns a structured forbidden payload if the user's role is not allowed, or null if permitted.
     *
     * @return array<string, mixed>|null
     */
    protected function enforceRole(AssistantContext $ctx): ?array
    {
        if (! in_array($ctx->role, $this->allowedRoles(), true)) {
            return [
                'forbidden' => true,
                'code' => 'FORBIDDEN',
                'required_roles' => $this->allowedRoles(),
                'message' => sprintf(
                    'Tool `%s` requires role (%s). Current session role is `%s`.',
                    $this->name(),
                    implode(' or ', $this->allowedRoles()),
                    $ctx->role,
                ),
            ];
        }

        return null;
    }

    /**
     * Resolves a Site from `site_id` or fuzzy `site`/`name` query.
     *
     * @param  array<string, mixed>  $args
     */
    protected function resolveSite(array $args): ?Site
    {
        if (! empty($args['site_id']) && is_numeric($args['site_id'])) {
            $found = Site::query()->find((int) $args['site_id']);
            if ($found) {
                return $found;
            }
        }

        $fuzzy = trim((string) ($args['site'] ?? $args['name'] ?? ''));
        if ($fuzzy === '') {
            return null;
        }

        if (ctype_digit($fuzzy)) {
            $found = Site::query()->find((int) $fuzzy);
            if ($found) {
                return $found;
            }
        }

        return Site::query()
            ->where('code', 'like', "%{$fuzzy}%")
            ->orWhere('name', 'like', "%{$fuzzy}%")
            ->orderBy('id')
            ->first();
    }

    /**
     * Normalizes single or multi-technology filters (`hydro`, `solar`, `wind`).
     *
     * @param  array<string, mixed>  $args
     * @return list<string>
     */
    protected function parseTechnologies(array $args): array
    {
        $raw = [];
        if (isset($args['technologies']) && is_array($args['technologies'])) {
            foreach ($args['technologies'] as $item) {
                if (is_string($item)) {
                    $raw[] = strtolower(trim($item));
                }
            }
        }
        foreach (['technology', 'type', 'types'] as $k) {
            if (! empty($args[$k]) && is_string($args[$k])) {
                foreach (explode(',', $args[$k]) as $piece) {
                    $raw[] = strtolower(trim($piece));
                }
            }
        }

        return array_values(array_unique(array_filter(
            $raw,
            fn (string $t) => in_array($t, ['hydro', 'solar', 'wind'], true)
        )));
    }
}

