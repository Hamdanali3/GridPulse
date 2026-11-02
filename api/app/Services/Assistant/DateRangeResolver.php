<?php

namespace App\Services\Assistant;

use Carbon\CarbonImmutable;
use Throwable;

final class DateRangeResolver
{
    /**
     * @param  array<string, mixed>  $args
     * @return array{from: CarbonImmutable, to: CarbonImmutable, label: string, is_all: bool}
     */
    public static function resolve(array $args, string $defaultRange = '7d'): array
    {
        $now = CarbonImmutable::now('UTC');
        $rawRange = strtolower(trim((string) ($args['range'] ?? $args['window'] ?? '')));
        $rawFrom = trim((string) ($args['from'] ?? ''));
        $rawTo = trim((string) ($args['to'] ?? ''));

        if ($rawFrom !== '') {
            try {
                $from = strlen($rawFrom) <= 10
                    ? CarbonImmutable::parse($rawFrom.' 00:00:00', 'UTC')
                    : CarbonImmutable::parse($rawFrom)->utc();
                $to = $rawTo !== ''
                    ? (strlen($rawTo) <= 10 ? CarbonImmutable::parse($rawTo.' 23:59:59', 'UTC') : CarbonImmutable::parse($rawTo)->utc())
                    : $now;
                if ($from->greaterThan($to)) {
                    [$from, $to] = [$to, $from];
                }

                return [
                    'from' => $from,
                    'to' => $to,
                    'label' => $from->toDateString().' to '.$to->toDateString(),
                    'is_all' => false,
                ];
            } catch (Throwable) {
                // Fall back to named range below
            }
        }

        $r = $rawRange !== '' ? $rawRange : strtolower($defaultRange);

        if (in_array($r, ['all', 'all_time', 'any'], true)) {
            return [
                'from' => CarbonImmutable::create(2000, 1, 1, 0, 0, 0, 'UTC'),
                'to' => $now,
                'label' => 'all time',
                'is_all' => true,
            ];
        }

        if (in_array($r, ['today', 'day'], true)) {
            $karachiStart = CarbonImmutable::now('Asia/Karachi')->startOfDay()->utc();

            return [
                'from' => $karachiStart,
                'to' => $now,
                'label' => 'today ('.CarbonImmutable::now('Asia/Karachi')->toDateString().' PKT)',
                'is_all' => false,
            ];
        }

        if (in_array($r, ['24h', '1d', 'last 24 hours', 'last_24_hours'], true)) {
            return [
                'from' => $now->subHours(24),
                'to' => $now,
                'label' => 'last 24 hours',
                'is_all' => false,
            ];
        }

        if (in_array($r, ['3d', '72h', 'last 3 days', 'last_3_days'], true)) {
            return [
                'from' => $now->subHours(72),
                'to' => $now,
                'label' => 'last 3 days',
                'is_all' => false,
            ];
        }

        if (in_array($r, ['14d', '2w', 'last 14 days'], true)) {
            return [
                'from' => $now->subDays(14),
                'to' => $now,
                'label' => 'last 14 days',
                'is_all' => false,
            ];
        }

        if (in_array($r, ['30d', 'month', 'last 30 days', 'last_30_days'], true)) {
            return [
                'from' => $now->subDays(30),
                'to' => $now,
                'label' => 'last 30 days',
                'is_all' => false,
            ];
        }

        if (preg_match('/^(\d+)\s*d/', $r, $m)) {
            $days = max(1, min(365, (int) $m[1]));

            return [
                'from' => $now->subDays($days),
                'to' => $now,
                'label' => "last {$days} days",
                'is_all' => false,
            ];
        }

        return [
            'from' => $now->subDays(7),
            'to' => $now,
            'label' => 'last 7 days',
            'is_all' => false,
        ];
    }
}
