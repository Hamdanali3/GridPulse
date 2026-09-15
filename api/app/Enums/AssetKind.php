<?php

namespace App\Enums;

enum AssetKind: string
{
    case Inverter = 'inverter';
    case Turbine = 'turbine';
    case PanelString = 'panel_string';
    case Transformer = 'transformer';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
