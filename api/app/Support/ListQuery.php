<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Shared pagination + sorting rules for list endpoints:
 *   ?page=1&limit=20&sort=-created_at,name
 * Sort keys are whitelisted per endpoint so clients cannot order by arbitrary columns.
 */
final class ListQuery
{
    public static function limit(Request $request, int $default = 20, int $max = 100): int
    {
        return max(1, min($max, (int) $request->query('limit', $default)));
    }

    /**
     * @param  list<string>  $allowed
     */
    public static function applySort(Builder $query, Request $request, array $allowed, string $default = '-created_at'): Builder
    {
        $raw = (string) $request->query('sort', $default);
        $applied = false;

        foreach (explode(',', $raw) as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }
            $direction = str_starts_with($part, '-') ? 'desc' : 'asc';
            $column = ltrim($part, '-');
            if (in_array($column, $allowed, true)) {
                $query->orderBy($column, $direction);
                $applied = true;
            }
        }

        if (! $applied) {
            $column = ltrim($default, '-');
            $query->orderBy($column, str_starts_with($default, '-') ? 'desc' : 'asc');
        }

        return $query;
    }
}
