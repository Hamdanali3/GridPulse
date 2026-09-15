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
        ListQuery::applySort($query, $request, ['created_at', 'action', 'entity_type'], '-created_at');

        return ApiResponse::paginated($query->paginate(ListQuery::limit($request, 30)), AuditLogResource::class);
    }
}
