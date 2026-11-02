<?php

namespace App\Http\Controllers;

use App\Http\Resources\AuditLogResource;
use App\Models\AuditLog;
use App\Support\ApiResponse;
use App\Support\ListQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = AuditLog::query()->with('actor');
        if ($action = $request->query('action')) {
            $query->where('action', 'like', '%'.$action.'%');
        }
        if ($entityType = $request->query('entity_type')) {
            $query->where('entity_type', $entityType);
        }
        if ($actorId = $request->query('actor_id')) {
            $query->where('actor_id', $actorId);
        }
        if ($from = $request->query('from')) {
            try {
                $fromTs = strlen((string) $from) <= 10
                    ? \Carbon\Carbon::parse((string) $from)->startOfDay()
                    : \Carbon\Carbon::parse((string) $from);
                $query->where('created_at', '>=', $fromTs);
            } catch (\Throwable) {
                // ignore invalid date
            }
        }
        if ($to = $request->query('to')) {
            try {
                $toTs = strlen((string) $to) <= 10
                    ? \Carbon\Carbon::parse((string) $to)->endOfDay()
                    : \Carbon\Carbon::parse((string) $to);
                $query->where('created_at', '<=', $toTs);
            } catch (\Throwable) {
                // ignore invalid date
            }
        }
        if ($q = $request->query('q')) {
            $query->where(function ($sub) use ($q) {
                $sub->where('action', 'like', '%'.$q.'%')
                    ->orWhere('entity_type', 'like', '%'.$q.'%')
                    ->orWhereHas('actor', fn ($aq) => $aq->where('name', 'like', '%'.$q.'%'));
            });
        }
        ListQuery::applySort($query, $request, ['created_at', 'action', 'entity_type'], '-created_at');

        return ApiResponse::paginated($query->paginate(ListQuery::limit($request, 30)), AuditLogResource::class);
    }
}
