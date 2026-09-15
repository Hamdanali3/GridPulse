<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AssetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'site_id' => $this->site_id,
            'site' => new SiteBriefResource($this->whenLoaded('site')),
            'name' => $this->name,
            'tag' => $this->tag,
            'kind' => $this->kind,
            'manufacturer' => $this->manufacturer,
            'serial_number' => $this->serial_number,
            'rated_kw' => (float) $this->rated_kw,
            'status' => $this->status,
            'health_score' => (float) $this->health_score,
            'installed_at' => $this->installed_at?->format('Y-m-d'),
            'latest' => new TelemetryReadingResource($this->whenLoaded('latestReading')),
            'open_alerts' => $this->whenHas('open_alerts_count', fn () => (int) $this->open_alerts_count),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
