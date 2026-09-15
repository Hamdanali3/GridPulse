<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TelemetryReading extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'asset_id', 'site_id', 'recorded_at', 'power_kw', 'efficiency_pct',
        'temperature_c', 'irradiance_wm2', 'wind_speed_ms',
    ];

    protected function casts(): array
    {
        return [
            'recorded_at' => 'datetime',
            'power_kw' => 'float',
            'efficiency_pct' => 'float',
            'temperature_c' => 'float',
            'irradiance_wm2' => 'float',
            'wind_speed_ms' => 'float',
        ];
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }
}
