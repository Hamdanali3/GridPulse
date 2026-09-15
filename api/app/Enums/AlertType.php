<?php

namespace App\Enums;

enum AlertType: string
{
    case LowEfficiency = 'low_efficiency';
    case HighTemperature = 'high_temperature';
    case AssetOffline = 'asset_offline';
    case ZeroOutput = 'zero_output';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
