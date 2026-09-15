<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SiteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'code' => $this->code,
            'type' => $this->type,
            'capacity_mw' => (float) $this->capacity_mw,
            'status' => $this->status,
            'lat' => (float) $this->lat,
            'lng' => (float) $this->lng,
            'region' => $this->region,
            'country' => $this->country,
            'commissioned_at' => $this->commissioned_at?->format('Y-m-d'),
            'min_efficiency' => (float) $this->min_efficiency,
            'max_temperature' => (float) $this->max_temperature,
            'asset_count' => $this->whenHas('assets_count', fn () => (int) $this->assets_count),
            'open_alerts' => $this->whenHas('open_alerts_count', fn () => (int) $this->open_alerts_count),
            'current_output_kw' => $this->when(isset($this->current_output_kw), fn () => round((float) $this->current_output_kw, 1)),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
