<?php

namespace App\Http\Controllers;

use App\Enums\AlertStatus;
use App\Enums\WorkOrderStatus;
use App\Http\Requests\StoreWorkOrderRequest;
use App\Http\Requests\UpdateWorkOrderRequest;
use App\Http\Resources\WorkOrderResource;
use App\Models\Alert;
use App\Models\WorkOrder;
use App\Services\AuditLogger;
use App\Support\ApiResponse;
use App\Support\ListQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkOrderController extends Controller
{
    private const RELATIONS = ['site', 'asset', 'assignee', 'creator', 'alert'];

    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = WorkOrder::query()->with(self::RELATIONS);
        foreach (['status', 'priority', 'site_id', 'assignee_id'] as $filter) {
            if ($value = $request->query($filter)) {
                $query->where($filter, $value);
            }
        }
        if ($q = $request->query('q')) {
            $query->where('title', 'like', '%'.$q.'%');
        }

        // "-priority" must sort by urgency, not alphabetically.
        $sort = (string) $request->query('sort', '-priority,due_at');
        if (str_contains($sort, 'priority')) {
            $dir = str_contains($sort, '-priority') ? 'desc' : 'asc';
            $query->orderByRaw("CASE priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'medium' THEN 1 ELSE 0 END {$dir}");
            $sort = trim(str_replace(['-priority', 'priority'], '', $sort), ',');
        }
        ListQuery::applySort($query, $request->merge(['sort' => $sort ?: 'due_at']), ['due_at', 'created_at', 'status', 'title'], 'due_at');

        return ApiResponse::paginated($query->paginate(ListQuery::limit($request)), WorkOrderResource::class);
    }

    public function store(StoreWorkOrderRequest $request): JsonResponse
    {
        $workOrder = DB::transaction(function () use ($request) {
            $wo = WorkOrder::create($request->validated() + ['created_by' => $request->user()->id]);
            if ($wo->alert_id) {
                Alert::whereKey($wo->alert_id)->update(['work_order_id' => $wo->id]);
            }

            return $wo;
        });
        $this->audit->log($request, 'work_order.create', 'WorkOrder', $workOrder->id, ['title' => $workOrder->title]);

        return ApiResponse::created(new WorkOrderResource($workOrder->load(self::RELATIONS)));
    }

    public function show(WorkOrder $workOrder): JsonResponse
    {
        return ApiResponse::ok(new WorkOrderResource($workOrder->load(self::RELATIONS)));
    }

    public function update(UpdateWorkOrderRequest $request, WorkOrder $workOrder): JsonResponse
    {
        DB::transaction(function () use ($request, $workOrder) {
            $workOrder->fill($request->validated())->save();
            // Finishing the work resolves the alert that raised it.
            if ($workOrder->status === WorkOrderStatus::Done && $workOrder->alert_id) {
                Alert::whereKey($workOrder->alert_id)->where('status', '!=', AlertStatus::Resolved->value)->update([
                    'status' => AlertStatus::Resolved->value,
                    'resolved_at' => now(),
                    'resolved_by' => $request->user()->id,
                ]);
            }
        });
        $this->audit->log($request, 'work_order.update', 'WorkOrder', $workOrder->id, ['fields' => array_keys($request->validated())]);

        return ApiResponse::ok(new WorkOrderResource($workOrder->refresh()->load(self::RELATIONS)));
    }

    public function destroy(Request $request, WorkOrder $workOrder): JsonResponse
    {
        $this->audit->log($request, 'work_order.delete', 'WorkOrder', $workOrder->id, ['title' => $workOrder->title]);
        $workOrder->delete(); // alerts.work_order_id is nulled by the foreign key

        return ApiResponse::noContent();
    }
}
