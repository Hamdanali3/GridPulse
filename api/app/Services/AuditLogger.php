<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Throwable;

/**
 * Records who did what to which entity. A failed audit write is logged but never breaks the request.
 */
class AuditLogger
{
    public function log(?Request $request, string $action, string $entityType, ?int $entityId = null, array $meta = [], ?User $actor = null): void
    {
        try {
            AuditLog::create([
                'actor_id' => $actor?->id ?? $request?->user()?->id,
                'action' => $action,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'meta' => $meta ?: null,
                'ip' => $request?->ip(),
                'created_at' => now(),
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }
}
