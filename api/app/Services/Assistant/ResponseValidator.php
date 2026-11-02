<?php

namespace App\Services\Assistant;

/**
 * Server-side JSON response schema validator & normalizer (Section 6 & Section 8).
 */
final class ResponseValidator
{
    private const CHART_TYPES = ['bar', 'line', 'area', 'stacked_bar', 'pie', 'progress'];

    private const TRENDS = ['up', 'down', 'flat', 'neutral'];

    private const ALLOWED_STATIC_ROUTES = [
        '/',
        '/sites',
        '/assets',
        '/alerts',
        '/work-orders',
        '/reports',
        '/team',
        '/audit',
        '/settings',
    ];

    /**
     * @param  list<array{label: string, route: string, query?: array<string, string>}>  $fallbackLinks
     * @param  list<int>|null  $validSiteIds
     * @return array{valid: true, data: array<string, mixed>}|array{valid: false, reason: string}
     */
    public static function validateSession(
        string $rawText,
        string $role,
        array $fallbackLinks = [],
        bool $hasRecords = false,
        ?array $validSiteIds = null,
    ): array {
        $cleaned = self::stripCodeFences($rawText);
        $decoded = json_decode($cleaned, true);

        if (! is_array($decoded) || array_is_list($decoded)) {
            return ['valid' => false, 'reason' => 'Output was not a valid JSON object.'];
        }

        $summary = isset($decoded['summary']) && is_string($decoded['summary']) ? trim($decoded['summary']) : '';
        if (mb_strlen($summary) < 12) {
            return ['valid' => false, 'reason' => 'Field `summary` is missing or too short.'];
        }

        foreach (['kpis', 'visuals', 'insights', 'links', 'followups'] as $listKey) {
            if (array_key_exists($listKey, $decoded) && ! is_array($decoded[$listKey])) {
                return ['valid' => false, 'reason' => "Field `{$listKey}` must be an array."];
            }
        }

        // Normalize KPIs (max 6)
        $kpis = [];
        foreach (($decoded['kpis'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }
            $label = isset($item['label']) && is_string($item['label']) ? trim($item['label']) : '';
            $val = $item['value'] ?? null;
            if ($label === '' || (! is_string($val) && ! is_int($val) && ! is_float($val))) {
                continue;
            }
            $kpi = [
                'label' => mb_substr($label, 0, 64),
                'value' => is_numeric($val) && ! is_string($val) ? round((float) $val, 2) : (is_string($val) ? mb_substr(trim($val), 0, 48) : $val),
            ];
            if (isset($item['unit']) && is_string($item['unit']) && trim($item['unit']) !== '') {
                $kpi['unit'] = mb_substr(trim($item['unit']), 0, 16);
            }
            if (isset($item['delta']) && is_string($item['delta']) && trim($item['delta']) !== '') {
                $kpi['delta'] = mb_substr(trim($item['delta']), 0, 32);
            }
            $trend = strtolower(trim((string) ($item['trend'] ?? '')));
            if (in_array($trend, self::TRENDS, true)) {
                $kpi['trend'] = $trend;
            }
            $kpis[] = $kpi;
            if (count($kpis) >= 6) {
                break;
            }
        }

        // Normalize Visuals (max 4)
        $visuals = [];
        foreach (($decoded['visuals'] ?? []) as $rawVis) {
            if (! is_array($rawVis)) {
                return ['valid' => false, 'reason' => 'Every item in `visuals` must be an object.'];
            }
            $vType = strtolower(trim((string) ($rawVis['type'] ?? '')));

            if ($vType === 'table') {
                if (! isset($rawVis['columns'], $rawVis['rows']) || ! is_array($rawVis['columns']) || ! is_array($rawVis['rows'])) {
                    return ['valid' => false, 'reason' => 'Table visual requires `columns` and `rows` arrays.'];
                }

                $colDefs = [];
                foreach ($rawVis['columns'] as $c) {
                    if (is_string($c) && trim($c) !== '') {
                        $colDefs[] = ['key' => trim($c), 'label' => trim($c)];
                    } elseif (is_array($c)) {
                        $ck = trim((string) ($c['key'] ?? $c['label'] ?? ''));
                        $cl = trim((string) ($c['label'] ?? $c['key'] ?? ''));
                        if ($ck !== '') {
                            $colDefs[] = ['key' => $ck, 'label' => $cl !== '' ? $cl : $ck];
                        }
                    }
                }
                if (count($colDefs) === 0) {
                    continue;
                }

                $rows = [];
                foreach (array_slice($rawVis['rows'], 0, 10) as $r) {
                    if (! is_array($r)) {
                        continue;
                    }
                    if (array_is_list($r)) {
                        $rowCells = [];
                        foreach ($colDefs as $idx => $_) {
                            $cell = $r[$idx] ?? null;
                            $rowCells[] = is_int($cell) || is_float($cell)
                                ? round((float) $cell, 2)
                                : ($cell === null ? '—' : mb_substr((string) $cell, 0, 120));
                        }
                        $rows[] = $rowCells;
                    } else {
                        $rowCells = [];
                        foreach ($colDefs as $cd) {
                            $cell = $r[$cd['key']] ?? $r[$cd['label']] ?? null;
                            $rowCells[] = is_int($cell) || is_float($cell)
                                ? round((float) $cell, 2)
                                : ($cell === null ? '—' : mb_substr((string) $cell, 0, 120));
                        }
                        $rows[] = $rowCells;
                    }
                }

                if (count($rows) > 0) {
                    $caption = trim((string) ($rawVis['caption'] ?? $rawVis['title'] ?? 'Summary table'));
                    $visuals[] = [
                        'type' => 'table',
                        'columns' => array_map(fn ($c) => $c['label'], $colDefs),
                        'rows' => $rows,
                        'caption' => mb_substr($caption !== '' ? $caption : 'Summary table', 0, 120),
                    ];
                }
            } elseif (in_array($vType, self::CHART_TYPES, true)) {
                if (! isset($rawVis['data']) || ! is_array($rawVis['data'])) {
                    return ['valid' => false, 'reason' => "Chart visual '{$vType}' requires a `data` array."];
                }
                $xKey = isset($rawVis['x']) && is_string($rawVis['x']) && trim($rawVis['x']) !== '' ? trim($rawVis['x']) : 'name';

                $series = [];
                foreach (($rawVis['series'] ?? []) as $s) {
                    if (is_string($s) && trim($s) !== '') {
                        $series[] = ['key' => trim($s), 'label' => self::humanizeKey(trim($s))];
                    } elseif (is_array($s)) {
                        $sk = trim((string) ($s['key'] ?? $s['dataKey'] ?? $s['name'] ?? ''));
                        if ($sk !== '') {
                            $sl = trim((string) ($s['label'] ?? $s['name'] ?? self::humanizeKey($sk)));
                            $entry = ['key' => $sk, 'label' => $sl !== '' ? $sl : self::humanizeKey($sk)];
                            if (! empty($s['color']) && is_string($s['color'])) {
                                $entry['color'] = trim($s['color']);
                            }
                            $series[] = $entry;
                        }
                    }
                }

                $dataRows = [];
                foreach (array_slice($rawVis['data'], 0, 36) as $item) {
                    if (! is_array($item) || array_is_list($item)) {
                        continue;
                    }
                    $rec = [];
                    foreach ($item as $dk => $dv) {
                        if (is_int($dv) || is_float($dv)) {
                            $rec[(string) $dk] = round((float) $dv, 2);
                        } elseif (is_string($dv)) {
                            if ((string) $dk !== $xKey && is_numeric(trim($dv))) {
                                $rec[(string) $dk] = round((float) $dv, 2);
                            } else {
                                $rec[(string) $dk] = mb_substr($dv, 0, 80);
                            }
                        } elseif ($dv === null) {
                            $rec[(string) $dk] = null;
                        }
                    }
                    if (count($rec) > 0) {
                        $dataRows[] = $rec;
                    }
                }

                if (count($series) === 0 && count($dataRows) > 0) {
                    foreach ($dataRows[0] as $dk => $dv) {
                        if ($dk !== $xKey && (is_int($dv) || is_float($dv))) {
                            $series[] = ['key' => $dk, 'label' => self::humanizeKey($dk)];
                        }
                    }
                }

                if (count($dataRows) > 0 && count($series) > 0) {
                    $title = trim((string) ($rawVis['title'] ?? 'Operational chart'));
                    $vis = [
                        'type' => $vType,
                        'title' => mb_substr($title !== '' ? $title : 'Operational chart', 0, 100),
                        'x' => $xKey,
                        'series' => array_slice($series, 0, 6),
                        'data' => $dataRows,
                    ];
                    if (isset($rawVis['unit']) && is_string($rawVis['unit']) && trim($rawVis['unit']) !== '') {
                        $vis['unit'] = mb_substr(trim($rawVis['unit']), 0, 16);
                    }
                    $visuals[] = $vis;
                }
            } else {
                return ['valid' => false, 'reason' => "Unsupported visual type '{$vType}'."];
            }

            if (count($visuals) >= 4) {
                break;
            }
        }

        // Insights (1-3)
        $insights = [];
        foreach (($decoded['insights'] ?? []) as $ins) {
            if (is_string($ins) && trim($ins) !== '') {
                $insights[] = mb_substr(trim($ins), 0, 220);
            }
            if (count($insights) >= 3) {
                break;
            }
        }

        // Validate Links strictly against router whitelist + role
        $links = [];
        $seen = [];
        foreach (($decoded['links'] ?? []) as $rl) {
            if (is_array($rl) && isset($rl['route']) && is_string($rl['route'])) {
                $basePath = explode('?', trim($rl['route']), 2)[0];
                if ($basePath !== '' && ! preg_match('#^/sites/\d+$#', $basePath) && ! in_array($basePath, self::ALLOWED_STATIC_ROUTES, true)) {
                    return ['valid' => false, 'reason' => "Invented non-whitelisted route '{$rl['route']}'."];
                }
            }
            $clean = NavigateTargets::sanitizeModelLink($rl, $role, $validSiteIds);
            if ($clean !== null) {
                $hrefKey = $clean['route'].'?'.http_build_query($clean['query'] ?? []);
                if (! isset($seen[$hrefKey])) {
                    $seen[$hrefKey] = true;
                    $links[] = $clean;
                }
            }
            if (count($links) >= 4) {
                break;
            }
        }

        if (count($links) === 0 && ($hasRecords || count($fallbackLinks) > 0)) {
            foreach ($fallbackLinks as $fb) {
                $hrefKey = $fb['route'].'?'.http_build_query($fb['query'] ?? []);
                if (! isset($seen[$hrefKey])) {
                    $seen[$hrefKey] = true;
                    $links[] = $fb;
                }
                if (count($links) >= 2) {
                    break;
                }
            }
            if (count($links) === 0) {
                $links[] = ['label' => 'Open Fleet Overview', 'route' => '/'];
            }
        }

        // Followups (3)
        $followups = [];
        foreach (($decoded['followups'] ?? []) as $f) {
            if (is_string($f) && trim($f) !== '') {
                $followups[] = mb_substr(trim($f), 0, 120);
            }
            if (count($followups) >= 3) {
                break;
            }
        }
        $defaults = match ($role) {
            'admin' => [
                'Show overdue work orders across all sites',
                'Summarize open critical alerts right now',
                'Show 7-day energy report grouped by technology',
            ],
            'engineer' => [
                'Which of my assigned work orders are due soonest?',
                'Show open critical and warning alerts across sites',
                'Which units have the lowest health score right now?',
            ],
            default => [
                'What is current fleet output and capacity factor?',
                'Compare 7-day energy generation by technology',
                'What does capacity factor mean in GridPulse?',
            ],
        };
        foreach ($defaults as $df) {
            if (count($followups) >= 3) {
                break;
            }
            if (! in_array($df, $followups, true)) {
                $followups[] = $df;
            }
        }

        $result = [
            'summary' => $summary,
            'kpis' => $kpis,
            'visuals' => $visuals,
            'insights' => count($insights) > 0 ? $insights : ['All figures reflect verified GridPulse operational records in Asia/Karachi time.'],
            'links' => $links,
            'followups' => array_slice($followups, 0, 3),
        ];

        if (isset($decoded['confidence_notes']) && is_string($decoded['confidence_notes']) && trim($decoded['confidence_notes']) !== '') {
            $result['confidence_notes'] = mb_substr(trim($decoded['confidence_notes']), 0, 260);
        }

        return ['valid' => true, 'data' => $result];
    }

    /**
     * @return array{valid: true, data: array<string, mixed>}|array{valid: false, reason: string}
     */
    public static function validatePublic(string $rawText): array
    {
        $cleaned = self::stripCodeFences($rawText);
        $decoded = json_decode($cleaned, true);

        if (! is_array($decoded) || array_is_list($decoded)) {
            return ['valid' => false, 'reason' => 'Public output was not a valid JSON object.'];
        }

        $summary = isset($decoded['summary']) && is_string($decoded['summary']) ? trim($decoded['summary']) : '';
        if (mb_strlen($summary) < 10) {
            return ['valid' => false, 'reason' => 'Field `summary` is missing or too short.'];
        }

        $bullets = [];
        if (isset($decoded['bullets']) && is_array($decoded['bullets'])) {
            foreach ($decoded['bullets'] as $b) {
                if (is_string($b) && trim($b) !== '') {
                    $bullets[] = mb_substr(trim($b), 0, 200);
                }
                if (count($bullets) >= 4) {
                    break;
                }
            }
        }

        $links = [];
        if (isset($decoded['links']) && is_array($decoded['links'])) {
            foreach ($decoded['links'] as $l) {
                if (! is_array($l)) {
                    continue;
                }
                $route = isset($l['route']) && is_string($l['route']) ? trim($l['route']) : '';
                $label = isset($l['label']) && is_string($l['label']) && trim($l['label']) !== ''
                    ? mb_substr(trim($l['label']), 0, 60)
                    : 'Explore GridPulse';
                if (in_array($route, NavigateTargets::PUBLIC_ALLOWED_ROUTES, true)) {
                    $links[] = ['label' => $label, 'route' => $route];
                }
                if (count($links) >= 3) {
                    break;
                }
            }
        }
        if (count($links) === 0) {
            $links[] = ['label' => 'Try Demo Sign In', 'route' => '/login'];
        }

        $followups = [];
        if (isset($decoded['followups']) && is_array($decoded['followups'])) {
            foreach ($decoded['followups'] as $f) {
                if (is_string($f) && trim($f) !== '') {
                    $followups[] = mb_substr(trim($f), 0, 110);
                }
                if (count($followups) >= 3) {
                    break;
                }
            }
        }
        foreach ([
            'How do alerts become work orders?',
            'What can Admin, Engineer, and Viewer roles do?',
            'How can I try the live demo?',
        ] as $d) {
            if (count($followups) >= 3) {
                break;
            }
            if (! in_array($d, $followups, true)) {
                $followups[] = $d;
            }
        }

        $data = [
            'summary' => $summary,
            'bullets' => $bullets,
            'links' => $links,
            'followups' => array_slice($followups, 0, 3),
        ];
        if (isset($decoded['refused']) && is_bool($decoded['refused'])) {
            $data['refused'] = $decoded['refused'];
        }

        return ['valid' => true, 'data' => $data];
    }

    private static function stripCodeFences(string $raw): string
    {
        $trimmed = trim($raw);
        if (str_starts_with($trimmed, '```')) {
            $trimmed = preg_replace('/^```(?:json)?\s*/i', '', $trimmed) ?? $trimmed;
            $trimmed = preg_replace('/\s*```$/', '', $trimmed) ?? $trimmed;
        }

        return trim($trimmed);
    }

    private static function humanizeKey(string $key): string
    {
        return ucwords(str_replace('_', ' ', $key));
    }
}

