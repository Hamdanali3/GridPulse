<?php

namespace App\Enums;

enum OperationalStatus: string
{
    case Online = 'online';
    case Degraded = 'degraded';
    case Offline = 'offline';
    case Maintenance = 'maintenance';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
