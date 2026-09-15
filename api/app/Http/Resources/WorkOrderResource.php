<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkOrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'priority' => $this->priority,
            'status' => $this->status,
            'site_id' => $this->site_id,
            'asset_id' => $this->asset_id,
            'alert_id' => $this->alert_id,
            'assignee_id' => $this->assignee_id,
            'site' => new SiteBriefResource($this->whenLoaded('site')),
            'asset' => new AssetBriefResource($this->whenLoaded('asset')),
            'alert' => $this->whenLoaded('alert', fn () => $this->alert ? [
                'id' => $this->alert->id,
                'type' => $this->alert->type,
                'severity' => $this->alert->severity,
                'status' => $this->alert->status,
            ] : null),
            'assignee' => new UserBriefResource($this->whenLoaded('assignee')),
            'created_by' => new UserBriefResource($this->whenLoaded('creator')),
            'due_at' => $this->due_at?->toISOString(),
            'completed_at' => $this->completed_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
