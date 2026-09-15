<?php

namespace App\Enums;

enum WorkOrderStatus: string
{
    case Planned = 'planned';
    case InProgress = 'in_progress';
    case Blocked = 'blocked';
    case Done = 'done';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
