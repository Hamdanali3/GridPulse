<?php

namespace App\Enums;

enum Severity: string
{
    case Critical = 'critical';
    case Warning = 'warning';
    case Info = 'info';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
