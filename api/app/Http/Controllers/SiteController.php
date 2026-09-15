<?php

namespace App\Http\Controllers;

use App\Enums\AlertStatus;
use App\Enums\OperationalStatus;
use App\Http\Requests\StoreSiteRequest;
use App\Http\Requests\UpdateSiteRequest;
use App\Http\Resources\SiteResource;
use App\Models\Site;
use App\Services\AuditLogger;
use App\Services\EnergyService;
use App\Support\ApiResponse;
use App\Support\ListQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SiteController extends Controller
{
    public function __construct(private readonly AuditLogger $audit, private readonly EnergyService $energy) {}

    public function index(Request $request): JsonResponse
    {
        $query = Site::query()
            ->withCount(['assets', 'alerts as open_alerts_count' => fn ($q) => $q->active()])
            ->search($request->query('q'))
            ->when($request->query('type'), fn ($q, $type) => $q->where('type', $type))
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status));
        ListQuery::applySort($query, $request, ['name', 'code', 'type', 'status', 'capacity_mw', 'created_at'], 'name');

        $page = $query->paginate(ListQuery::limit($request));
        $output = $this->energy->latestOutputBySite(collect($page->items())->pluck('id')->all());
        foreach ($page->items() as $site) {
            $site->current_output_kw = $output->get($site->id, 0);
        }

        return ApiResponse::paginated($page, SiteResource::class);
    }

    public function store(StoreSiteRequest $request): JsonResponse
    {
        $site = Site::create($request->validated() + ['created_by' => $request->user()->id]);
        $this->audit->log($request, 'site.create', 'Site', $site->id, ['code' => $site->code]);

        return ApiResponse::created(new SiteResource($site));
    }

    public function show(Site $site): JsonResponse
    {
        $site->loadCount(['assets', 'alerts as open_alerts_count' => fn ($q) => $q->active()]);
        $site->current_output_kw = $this->energy->latestOutputBySite([$site->id])->get($site->id, 0);

        return ApiResponse::ok(new SiteResource($site));
    }

    public function update(UpdateSiteRequest $request, Site $site): JsonResponse
    {
        $site->update($request->validated());
        $this->audit->log($request, 'site.update', 'Site', $site->id, ['fields' => array_keys($request->validated())]);

        return ApiResponse::ok(new SiteResource($site->refresh()));
    }

    public function destroy(Request $request, Site $site): JsonResponse
    {
        // Assets, readings, alerts and work orders cascade through foreign keys.
        $this->audit->log($request, 'site.delete', 'Site', $site->id, ['code' => $site->code]);
        $site->delete();

        return ApiResponse::noContent();
    }

    public function summary(Site $site): JsonResponse
    {
        $assetsByStatus = $site->assets()->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status');
        $alertsBySeverity = $site->alerts()->active()->selectRaw('severity, COUNT(*) as c')->groupBy('severity')->pluck('c', 'severity');
        $total = (int) $assetsByStatus->sum();
        $online = (int) $assetsByStatus->get(OperationalStatus::Online->value, 0);
        $outputKw = (float) $this->energy->latestOutputBySite([$site->id])->get($site->id, 0);
        $capacityKw = $site->capacityKw();

        return ApiResponse::ok([
            'current_output_kw' => $outputKw,
            'capacity_kw' => $capacityKw,
            'capacity_factor_pct' => $capacityKw > 0 ? round($outputKw / $capacityKw * 100, 1) : 0,
            'today_energy_kwh' => (float) $this->energy->todayEnergyBySite([$site->id])->get($site->id, 0),
            'availability_pct' => $total > 0 ? round($online / $total * 100, 1) : 0,
            'assets_by_status' => $assetsByStatus->map(fn ($c) => (int) $c),
            'alerts_by_severity' => $alertsBySeverity->map(fn ($c) => (int) $c),
            'open_work_orders' => $site->workOrders()->where('status', '!=', 'done')->count(),
        ]);
    }
}
