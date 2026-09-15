<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TelemetryReadingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'asset_id' => $this->asset_id,
            'site_id' => $this->site_id,
            'recorded_at' => $this->recorded_at?->toISOString(),
            'power_kw' => (float) $this->power_kw,
            'efficiency_pct' => (float) $this->efficiency_pct,
            'temperature_c' => (float) $this->temperature_c,
            'irradiance_wm2' => $this->irradiance_wm2 !== null ? (float) $this->irradiance_wm2 : null,
            'wind_speed_ms' => $this->wind_speed_ms !== null ? (float) $this->wind_speed_ms : null,
        ];
    }
}
