<?php

namespace App\Enums;

enum Role: string
{
    case Admin = 'admin';
    case Engineer = 'engineer';
    case Viewer = 'viewer';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $r) => $r->value, self::cases());
    }
}
