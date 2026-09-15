<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AlertResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'site_id' => $this->site_id,
            'asset_id' => $this->asset_id,
            'site' => new SiteBriefResource($this->whenLoaded('site')),
            'asset' => new AssetBriefResource($this->whenLoaded('asset')),
            'type' => $this->type,
            'severity' => $this->severity,
            'status' => $this->status,
            'message' => $this->message,
            'value' => $this->value !== null ? (float) $this->value : null,
            'acknowledged_by' => new UserBriefResource($this->whenLoaded('acknowledger')),
            'acknowledged_at' => $this->acknowledged_at?->toISOString(),
            'resolved_by' => new UserBriefResource($this->whenLoaded('resolver')),
            'resolved_at' => $this->resolved_at?->toISOString(),
            'work_order_id' => $this->work_order_id,
            'work_order' => $this->whenLoaded('workOrder', fn () => $this->workOrder ? [
                'id' => $this->workOrder->id,
                'title' => $this->workOrder->title,
                'status' => $this->workOrder->status,
                'priority' => $this->workOrder->priority,
            ] : null),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
