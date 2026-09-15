<?php

namespace App\Http\Controllers;

use App\Enums\AlertStatus;
use App\Enums\Priority;
use App\Enums\Severity;
use App\Http\Requests\AlertToWorkOrderRequest;
use App\Http\Resources\AlertResource;
use App\Http\Resources\WorkOrderResource;
use App\Models\Alert;
use App\Models\WorkOrder;
use App\Services\AuditLogger;
use App\Support\ApiResponse;
use App\Support\ListQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AlertController extends Controller
{
    private const RELATIONS = ['site', 'asset', 'acknowledger', 'resolver'];

    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = Alert::query()->with(self::RELATIONS);
        foreach (['status', 'severity', 'type', 'site_id', 'asset_id'] as $filter) {
            if ($value = $request->query($filter)) {
                $query->where($filter, $value);
            }
        }
        ListQuery::applySort($query, $request, ['created_at', 'severity', 'status', 'acknowledged_at', 'resolved_at'], '-created_at');

        return ApiResponse::paginated($query->paginate(ListQuery::limit($request)), AlertResource::class);
    }

    public function show(Alert $alert): JsonResponse
    {
        return ApiResponse::ok(new AlertResource($alert->load([...self::RELATIONS, 'workOrder'])));
    }

    public function acknowledge(Request $request, Alert $alert): JsonResponse
    {
        if ($alert->status !== AlertStatus::Open) {
            return ApiResponse::error(409, 'CONFLICT', "This alert is already {$alert->status->value}.");
        }
        $alert->acknowledge($request->user());
        $this->audit->log($request, 'alert.acknowledge', 'Alert', $alert->id);

        return ApiResponse::ok(new AlertResource($alert->load(self::RELATIONS)));
    }

    public function resolve(Request $request, Alert $alert): JsonResponse
    {
        if ($alert->status === AlertStatus::Resolved) {
            return ApiResponse::error(409, 'CONFLICT', 'This alert is already resolved.');
        }
        $alert->resolve($request->user());
        $this->audit->log($request, 'alert.resolve', 'Alert', $alert->id);

        return ApiResponse::ok(new AlertResource($alert->load(self::RELATIONS)));
    }

    /** Turns an alert into a tracked work order and links both sides inside one transaction. */
    public function toWorkOrder(AlertToWorkOrderRequest $request, Alert $alert): JsonResponse
    {
        if ($alert->work_order_id) {
            return ApiResponse::error(409, 'CONFLICT', 'A work order already exists for this alert.');
        }
        $alert->load('asset');

        $priority = $request->input('priority') ?? match ($alert->severity) {
            Severity::Critical => Priority::Urgent->value,
            Severity::Warning => Priority::High->value,
            Severity::Info => Priority::Medium->value,
        };

        $workOrder = DB::transaction(function () use ($request, $alert, $priority) {
            $wo = WorkOrder::create([
                'title' => $request->input('title') ?: sprintf('Investigate %s on %s', str_replace('_', ' ', $alert->type->value), $alert->asset?->name ?? 'asset'),
                'description' => $alert->message,
                'priority' => $priority,
                'site_id' => $alert->site_id,
                'asset_id' => $alert->asset_id,
                'alert_id' => $alert->id,
                'assignee_id' => $request->input('assignee_id'),
                'due_at' => $request->input('due_at'),
                'created_by' => $request->user()->id,
            ]);
            $alert->work_order_id = $wo->id;
            if ($alert->status === AlertStatus::Open) {
                $alert->status = AlertStatus::Acknowledged;
                $alert->acknowledged_by = $request->user()->id;
                $alert->acknowledged_at = now();
            }
            $alert->save();

            return $wo;
        });

        $this->audit->log($request, 'alert.to_work_order', 'Alert', $alert->id, ['work_order_id' => $workOrder->id]);

        return ApiResponse::created(new WorkOrderResource($workOrder->load(['site', 'asset', 'assignee', 'creator', 'alert'])));
    }
}
