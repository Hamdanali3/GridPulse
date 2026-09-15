<?php

namespace App\Http\Controllers;

use App\Enums\AlertStatus;
use App\Enums\AlertType;
use App\Enums\OperationalStatus;
use App\Http\Requests\StoreAssetRequest;
use App\Http\Requests\UpdateAssetRequest;
use App\Http\Resources\AssetResource;
use App\Models\Asset;
use App\Services\AuditLogger;
use App\Support\ApiResponse;
use App\Support\ListQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssetController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = Asset::query()
            ->with(['site', 'latestReading'])
            ->search($request->query('q'))
            ->when($request->query('site_id'), fn ($q, $id) => $q->where('site_id', $id))
            ->when($request->query('kind'), fn ($q, $kind) => $q->where('kind', $kind))
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status));
        ListQuery::applySort($query, $request, ['tag', 'name', 'kind', 'status', 'rated_kw', 'health_score', 'created_at'], 'tag');

        return ApiResponse::paginated($query->paginate(ListQuery::limit($request)), AssetResource::class);
    }

    public function store(StoreAssetRequest $request): JsonResponse
    {
        $asset = Asset::create($request->validated());
        $this->audit->log($request, 'asset.create', 'Asset', $asset->id, ['tag' => $asset->tag]);

        return ApiResponse::created(new AssetResource($asset->load('site')));
    }

    public function show(Asset $asset): JsonResponse
    {
        $asset->load(['site', 'latestReading'])->loadCount(['alerts as open_alerts_count' => fn ($q) => $q->active()]);

        return ApiResponse::ok(new AssetResource($asset));
    }

    public function update(UpdateAssetRequest $request, Asset $asset): JsonResponse
    {
        $asset->update($request->validated());

        // Bringing an asset back online closes its offline alert automatically.
        if ($request->filled('status') && $asset->status !== OperationalStatus::Offline) {
            $asset->alerts()->active()->where('type', AlertType::AssetOffline->value)->update([
                'status' => AlertStatus::Resolved->value,
                'resolved_at' => now(),
                'resolved_by' => $request->user()->id,
            ]);
        }
        $this->audit->log($request, 'asset.update', 'Asset', $asset->id, ['fields' => array_keys($request->validated())]);

        return ApiResponse::ok(new AssetResource($asset->refresh()->load('site')));
    }

    public function destroy(Request $request, Asset $asset): JsonResponse
    {
        $this->audit->log($request, 'asset.delete', 'Asset', $asset->id, ['tag' => $asset->tag]);
        $asset->delete(); // readings and alerts cascade; work orders keep history with asset_id nulled

        return ApiResponse::noContent();
    }
}
