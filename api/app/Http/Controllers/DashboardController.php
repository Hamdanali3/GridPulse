<?php

namespace App\Http\Controllers;

use App\Enums\OperationalStatus;
use App\Http\Resources\AlertResource;
use App\Models\Alert;
use App\Models\Asset;
use App\Models\Site;
use App\Models\WorkOrder;
use App\Services\EnergyService;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function __construct(private readonly EnergyService $energy) {}

    public function overview(): JsonResponse
    {
        $sites = Site::query()->get();
        $output = $this->energy->latestOutputBySite();
        $todayEnergy = $this->energy->todayEnergyBySite();

        $assetsByStatus = Asset::query()->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status')->map(fn ($c) => (int) $c);
        $alertsBySeverity = Alert::query()->active()->selectRaw('severity, COUNT(*) as c')->groupBy('severity')->pluck('c', 'severity')->map(fn ($c) => (int) $c);
        $workOrdersByStatus = WorkOrder::query()->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status')->map(fn ($c) => (int) $c);
        $recentAlerts = Alert::query()->active()->with(['site', 'asset'])->latest()->limit(8)->get();
        $dueThisWeek = WorkOrder::query()->where('status', '!=', 'done')->whereNotNull('due_at')->where('due_at', '<=', now()->addWeek())->count();

        $siteRows = $sites->map(function (Site $s) use ($output, $todayEnergy) {
            $kw = (float) $output->get($s->id, 0);
            $capKw = $s->capacityKw();

            return [
                'id' => $s->id,
                'name' => $s->name,
                'code' => $s->code,
                'type' => $s->type,
                'status' => $s->status,
                'capacity_mw' => (float) $s->capacity_mw,
                'lat' => (float) $s->lat,
                'lng' => (float) $s->lng,
                'current_output_kw' => $kw,
                'capacity_factor_pct' => $capKw > 0 ? round($kw / $capKw * 100, 1) : 0,
                'today_energy_kwh' => (float) $todayEnergy->get($s->id, 0),
            ];
        });

        $fleetKw = round($siteRows->sum('current_output_kw'), 1);
        $capacityKw = $sites->sum(fn (Site $s) => $s->capacityKw());
        $totalAssets = (int) $assetsByStatus->sum();
        $onlineAssets = (int) $assetsByStatus->get(OperationalStatus::Online->value, 0);

        $byType = $siteRows->groupBy(fn ($r) => $r['type']->value)->map(fn ($rows) => [
            'kw' => round($rows->sum('current_output_kw'), 1),
            'capacity_kw' => $rows->sum('capacity_mw') * 1000,
            'sites' => $rows->count(),
        ]);

        $ranked = $siteRows->sortByDesc('capacity_factor_pct')->values();

        return ApiResponse::ok([
            'fleet' => [
                'current_output_kw' => $fleetKw,
                'capacity_kw' => $capacityKw,
                'capacity_factor_pct' => $capacityKw > 0 ? round($fleetKw / $capacityKw * 100, 1) : 0,
                'today_energy_kwh' => round($siteRows->sum('today_energy_kwh'), 1),
                'availability_pct' => $totalAssets > 0 ? round($onlineAssets / $totalAssets * 100, 1) : 0,
                'total_sites' => $sites->count(),
                'total_assets' => $totalAssets,
            ],
            'alerts' => [
                'open' => (int) $alertsBySeverity->sum(),
                'by_severity' => $alertsBySeverity,
                'recent' => AlertResource::collection($recentAlerts)->resolve(),
            ],
            'work_orders' => [
                'due_this_week' => $dueThisWeek,
                'by_status' => $workOrdersByStatus,
            ],
            'sites' => $siteRows->values(),
            'sites_by_status' => $siteRows->countBy(fn ($r) => $r['status']->value),
            'generation_by_type' => $byType,
            'top_sites' => $ranked->take(5)->values(),
            'bottom_sites' => $ranked->reverse()->take(5)->values(),
        ]);
    }
}
