<?php

namespace App\Services\Assistant;

/**
 * Verified client router whitelist (`client/src/App.tsx`).
 * PulseBot never invents routes; all deep links resolve strictly through this class.
 */
final class NavigateTargets
{
    private const SITE_TYPES = ['solar', 'wind', 'hydro'];

    private const OP_STATUSES = ['online', 'degraded', 'offline', 'maintenance'];

    private const ASSET_KINDS = ['inverter', 'turbine', 'panel_string', 'transformer'];

    private const ALERT_STATUSES = ['open', 'acknowledged', 'resolved', 'all'];

    private const SEVERITIES = ['critical', 'warning', 'info'];

    private const ALERT_TYPES = ['low_efficiency', 'high_temperature', 'asset_offline', 'zero_output'];

    private const WO_STATUSES = ['planned', 'in_progress', 'blocked', 'done'];

    private const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

    private const REPORT_GROUPS = ['site', 'type', 'day'];

    public const PUBLIC_ALLOWED_ROUTES = [
        '/login',
        '/register',
        '/#platform',
        '/#capabilities',
        '/#about',
        '/#contact',
    ];

    /**
     * @param  array<string, mixed>  $params
     * @param  list<int>|null  $validSiteIds
     * @return array{ok: bool, forbidden?: bool, message?: string, link?: array{label: string, route: string, query?: array<string, string>}}
     */
    public static function resolve(string $intent, array $params, string $role, ?array $validSiteIds = null): array
    {
        $key = strtolower(trim($intent));
        $labelOverride = isset($params['label']) && is_string($params['label']) && trim($params['label']) !== ''
            ? mb_substr(trim($params['label']), 0, 90)
            : null;

        if (in_array($key, ['team', '/team'], true) && $role !== 'admin') {
            return [
                'ok' => false,
                'forbidden' => true,
                'message' => 'Team management requires the Admin role.',
            ];
        }

        if (in_array($key, ['audit', 'audit_log', '/audit'], true) && $role !== 'admin') {
            return [
                'ok' => false,
                'forbidden' => true,
                'message' => 'The Audit Log requires the Admin role.',
            ];
        }

        return match ($key) {
            'overview', 'dashboard', '/' => [
                'ok' => true,
                'link' => ['label' => $labelOverride ?? 'Open Fleet Overview', 'route' => '/'],
            ],
            'sites', '/sites' => self::buildSitesLink($params, $labelOverride),
            'site_detail', 'site' => self::buildSiteDetailLink($params, $role, $validSiteIds, $labelOverride),
            'assets', '/assets' => self::buildAssetsLink($params, $labelOverride),
            'alerts', '/alerts' => self::buildAlertsLink($params, $labelOverride),
            'work_orders', 'work-orders', '/work-orders' => self::buildWorkOrdersLink($params, $labelOverride),
            'reports', 'energy_report', '/reports' => self::buildReportsLink($params, $labelOverride),
            'team', '/team' => [
                'ok' => true,
                'link' => ['label' => $labelOverride ?? 'Open Team Management', 'route' => '/team'],
            ],
            'audit', 'audit_log', '/audit' => self::buildAuditLink($params, $labelOverride),
            'settings', '/settings' => [
                'ok' => true,
                'link' => ['label' => $labelOverride ?? 'Open Settings', 'route' => '/settings'],
            ],
            default => [
                'ok' => false,
                'message' => "Unknown navigation intent '{$intent}'.",
            ],
        };
    }

    /**
     * @param  list<int>|null  $validSiteIds
     * @return array{label: string, route: string, query?: array<string, string>}|null
     */
    public static function sanitizeModelLink(mixed $raw, string $role, ?array $validSiteIds = null): ?array
    {
        if (! is_array($raw)) {
            return null;
        }

        $rawRoute = isset($raw['route']) && is_string($raw['route']) ? trim($raw['route']) : '';
        if ($rawRoute === '') {
            return null;
        }

        $mergedQuery = [];
        $pathname = $rawRoute;
        if (str_contains($rawRoute, '?')) {
            [$pathname, $qs] = explode('?', $rawRoute, 2);
            parse_str($qs, $parsedQs);
            foreach ($parsedQs as $k => $v) {
                if (is_scalar($v)) {
                    $mergedQuery[(string) $k] = (string) $v;
                }
            }
        }

        if (isset($raw['query']) && is_array($raw['query'])) {
            foreach ($raw['query'] as $k => $v) {
                if ($v !== null && is_scalar($v) && trim((string) $v) !== '') {
                    $mergedQuery[(string) $k] = trim((string) $v);
                }
            }
        }

        if (isset($raw['label']) && is_string($raw['label']) && trim($raw['label']) !== '') {
            $mergedQuery['label'] = trim($raw['label']);
        }

        if (preg_match('#^/sites/(\d+)$#', $pathname, $m)) {
            $mergedQuery['site_id'] = $m[1];
            $resolved = self::resolve('site_detail', $mergedQuery, $role, $validSiteIds);

            return ($resolved['ok'] ?? false) ? ($resolved['link'] ?? null) : null;
        }

        $allowedStatic = ['/', '/sites', '/assets', '/alerts', '/work-orders', '/reports', '/team', '/audit', '/settings'];
        if (! in_array($pathname, $allowedStatic, true)) {
            return null;
        }

        $resolved = self::resolve($pathname, $mergedQuery, $role, $validSiteIds);

        return ($resolved['ok'] ?? false) ? ($resolved['link'] ?? null) : null;
    }

    /** @param array<string, mixed> $params */
    private static function buildSitesLink(array $params, ?string $labelOverride): array
    {
        $q = [];
        if (! empty($params['q']) && is_string($params['q'])) {
            $q['q'] = mb_substr(trim($params['q']), 0, 60);
        }
        $type = strtolower(trim((string) ($params['type'] ?? $params['technology'] ?? '')));
        if (in_array($type, self::SITE_TYPES, true)) {
            $q['type'] = $type;
        }
        $status = strtolower(trim((string) ($params['status'] ?? '')));
        if (in_array($status, self::OP_STATUSES, true)) {
            $q['status'] = $status;
        }
        if (in_array($params['view'] ?? '', ['cards', 'table'], true)) {
            $q['view'] = (string) $params['view'];
        }

        $parts = array_values(array_filter([$q['type'] ?? null, $q['status'] ?? null]));
        $defaultLabel = count($parts) ? 'Open Sites ('.implode(', ', $parts).')' : 'Open Sites';

        return ['ok' => true, 'link' => self::packLink($labelOverride ?? $defaultLabel, '/sites', $q)];
    }

    /**
     * @param  array<string, mixed>  $params
     * @param  list<int>|null  $validSiteIds
     */
    private static function buildSiteDetailLink(array $params, string $role, ?array $validSiteIds, ?string $labelOverride): array
    {
        $siteId = self::cleanPositiveInt($params['site_id'] ?? $params['id'] ?? null);
        if ($siteId === null) {
            return self::buildSitesLink($params, $labelOverride);
        }
        if ($validSiteIds !== null && count($validSiteIds) > 0 && ! in_array((int) $siteId, $validSiteIds, true)) {
            return self::buildSitesLink($params, $labelOverride);
        }

        $q = [];
        $r = strtolower(trim((string) ($params['range'] ?? '')));
        if (in_array($r, ['24', '24h'], true)) {
            $q['range'] = '24';
        } elseif (in_array($r, ['72', '72h', '3d'], true)) {
            $q['range'] = '72';
        } elseif (in_array($r, ['168', '168h', '7d'], true)) {
            $q['range'] = '168';
        }

        $name = isset($params['site_name']) && is_string($params['site_name']) && trim($params['site_name']) !== ''
            ? trim($params['site_name'])
            : "Site #{$siteId}";

        return ['ok' => true, 'link' => self::packLink($labelOverride ?? "Inspect {$name}", "/sites/{$siteId}", $q)];
    }

    /** @param array<string, mixed> $params */
    private static function buildAssetsLink(array $params, ?string $labelOverride): array
    {
        $q = [];
        if (! empty($params['q']) && is_string($params['q'])) {
            $q['q'] = mb_substr(trim($params['q']), 0, 60);
        }
        if (($siteId = self::cleanPositiveInt($params['site_id'] ?? null)) !== null) {
            $q['site_id'] = $siteId;
        }
        $kind = strtolower(trim((string) ($params['kind'] ?? '')));
        if (in_array($kind, self::ASSET_KINDS, true)) {
            $q['kind'] = $kind;
        }
        $status = strtolower(trim((string) ($params['status'] ?? '')));
        if (in_array($status, self::OP_STATUSES, true)) {
            $q['status'] = $status;
        }

        $defaultLabel = isset($q['status']) ? "Open Assets ({$q['status']})" : 'Open Assets';

        return ['ok' => true, 'link' => self::packLink($labelOverride ?? $defaultLabel, '/assets', $q)];
    }

    /** @param array<string, mixed> $params */
    private static function buildAlertsLink(array $params, ?string $labelOverride): array
    {
        $q = [];
        $status = strtolower(trim((string) ($params['status'] ?? '')));
        if (in_array($status, self::ALERT_STATUSES, true)) {
            $q['status'] = $status;
        }
        $sev = strtolower(trim((string) ($params['severity'] ?? '')));
        if (in_array($sev, self::SEVERITIES, true)) {
            $q['severity'] = $sev;
        }
        $type = strtolower(trim((string) ($params['type'] ?? '')));
        if (in_array($type, self::ALERT_TYPES, true)) {
            $q['type'] = $type;
        }
        if (($siteId = self::cleanPositiveInt($params['site_id'] ?? null)) !== null) {
            $q['site_id'] = $siteId;
        }

        $parts = array_values(array_filter([$q['severity'] ?? null, $q['status'] ?? null]));
        $defaultLabel = count($parts) ? 'Open Alerts ('.implode(', ', $parts).')' : 'Open Alerts';

        return ['ok' => true, 'link' => self::packLink($labelOverride ?? $defaultLabel, '/alerts', $q)];
    }

    /** @param array<string, mixed> $params */
    private static function buildWorkOrdersLink(array $params, ?string $labelOverride): array
    {
        $q = [];
        if (in_array($params['view'] ?? '', ['board', 'table'], true)) {
            $q['view'] = (string) $params['view'];
        }
        if (! empty($params['q']) && is_string($params['q'])) {
            $q['q'] = mb_substr(trim($params['q']), 0, 60);
        }
        if (($siteId = self::cleanPositiveInt($params['site_id'] ?? null)) !== null) {
            $q['site_id'] = $siteId;
        }
        if (($assigneeId = self::cleanPositiveInt($params['assignee_id'] ?? null)) !== null) {
            $q['assignee_id'] = $assigneeId;
        }
        if (in_array($params['mine'] ?? null, [true, 1, '1', 'true'], true)) {
            $q['mine'] = '1';
        }
        if (in_array($params['overdue'] ?? $params['overdue_only'] ?? null, [true, 1, '1', 'true'], true)) {
            $q['overdue'] = '1';
        }

        $status = strtolower(trim((string) ($params['status'] ?? '')));
        if (in_array($status, self::WO_STATUSES, true)) {
            $q['status'] = $status;
        }
        $priority = strtolower(trim((string) ($params['priority'] ?? '')));
        if (in_array($priority, self::PRIORITIES, true)) {
            $q['priority'] = $priority;
        }

        $rawTechs = [];
        if (isset($params['technologies']) && is_array($params['technologies'])) {
            foreach ($params['technologies'] as $t) {
                if (is_string($t)) {
                    $rawTechs[] = strtolower(trim($t));
                }
            }
        } elseif (! empty($params['types']) && is_string($params['types'])) {
            $rawTechs = array_map(fn ($s) => strtolower(trim($s)), explode(',', $params['types']));
        } elseif (! empty($params['technology']) && is_string($params['technology'])) {
            $rawTechs = array_map(fn ($s) => strtolower(trim($s)), explode(',', $params['technology']));
        }
        $validTechs = array_values(array_unique(array_filter($rawTechs, fn ($t) => in_array($t, self::SITE_TYPES, true))));
        if (count($validTechs) > 0) {
            $q['types'] = implode(',', $validTechs);
        }

        if (($from = self::cleanDate($params['from'] ?? null)) !== null) {
            $q['from'] = $from;
        }
        if (($to = self::cleanDate($params['to'] ?? null)) !== null) {
            $q['to'] = $to;
        }

        if (! isset($q['view']) && (isset($q['from']) || isset($q['to']) || isset($q['types']) || isset($q['overdue']) || isset($q['status']))) {
            $q['view'] = 'table';
        }

        $tags = [];
        if (($q['overdue'] ?? '') === '1') {
            $tags[] = 'Overdue';
        }
        if (isset($q['types'])) {
            $tags[] = implode(' + ', array_map('ucfirst', explode(',', $q['types'])));
        }
        if (isset($q['from'], $q['to'])) {
            $tags[] = "{$q['from']} to {$q['to']}";
        } elseif (isset($q['status'])) {
            $tags[] = str_replace('_', ' ', $q['status']);
        }

        $defaultLabel = count($tags) ? 'Open Work Orders ('.implode(', ', $tags).')' : 'Open Work Orders';

        return ['ok' => true, 'link' => self::packLink($labelOverride ?? $defaultLabel, '/work-orders', $q)];
    }

    /** @param array<string, mixed> $params */
    private static function buildReportsLink(array $params, ?string $labelOverride): array
    {
        $q = [];
        if (($from = self::cleanDate($params['from'] ?? null)) !== null) {
            $q['from'] = $from;
        }
        if (($to = self::cleanDate($params['to'] ?? null)) !== null) {
            $q['to'] = $to;
        }
        $gb = strtolower(trim((string) ($params['group_by'] ?? '')));
        if (in_array($gb, self::REPORT_GROUPS, true)) {
            $q['group_by'] = $gb;
        }

        $defaultLabel = isset($q['group_by']) ? "Open Energy Reports (by {$q['group_by']})" : 'Open Energy Reports';

        return ['ok' => true, 'link' => self::packLink($labelOverride ?? $defaultLabel, '/reports', $q)];
    }

    /** @param array<string, mixed> $params */
    private static function buildAuditLink(array $params, ?string $labelOverride): array
    {
        $q = [];
        if (! empty($params['q']) && is_string($params['q'])) {
            $q['q'] = mb_substr(trim($params['q']), 0, 60);
        }
        if (! empty($params['action']) && is_string($params['action'])) {
            $q['action'] = mb_substr(trim($params['action']), 0, 60);
        }
        if (($from = self::cleanDate($params['from'] ?? null)) !== null) {
            $q['from'] = $from;
        }

        return ['ok' => true, 'link' => self::packLink($labelOverride ?? 'Open Audit Log', '/audit', $q)];
    }

    /**
     * @param  array<string, string>  $query
     * @return array{label: string, route: string, query?: array<string, string>}
     */
    private static function packLink(string $label, string $route, array $query): array
    {
        return count($query) > 0
            ? ['label' => $label, 'route' => $route, 'query' => $query]
            : ['label' => $label, 'route' => $route];
    }

    private static function cleanDate(mixed $val): ?string
    {
        if (! is_string($val)) {
            return null;
        }
        $trimmed = substr(trim($val), 0, 10);

        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) ? $trimmed : null;
    }

    private static function cleanPositiveInt(mixed $val): ?string
    {
        if (is_int($val) && $val > 0) {
            return (string) $val;
        }
        if (is_string($val) && preg_match('/^\d+$/', trim($val)) && (int) trim($val) > 0) {
            return trim($val);
        }

        return null;
    }
}
