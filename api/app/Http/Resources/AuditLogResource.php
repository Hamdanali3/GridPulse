<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'actor' => new UserBriefResource($this->whenLoaded('actor')),
            'action' => $this->action,
            'entity_type' => $this->entity_type,
            'entity_id' => $this->entity_id,
            'meta' => $this->meta,
            'ip' => $this->ip,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
