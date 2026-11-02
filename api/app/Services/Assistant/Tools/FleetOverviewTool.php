<?php

namespace App\Services\Assistant\Tools;

use App\Enums\OperationalStatus;
use App\Models\Alert;
use App\Models\Asset;
use App\Models\Site;
use App\Models\WorkOrder;
use App\Services\Assistant\AssistantContext;
use App\Services\EnergyService;

final class FleetOverviewTool extends AbstractTool
{
    public function __construct(private readonly EnergyService $energy) {}

    public function name(): string
    {
        return 'fleet_overview';
    }

    public function description(): string
    {
        return 'Get live fleet power output (MW/kW), installed capacity, capacity factor %, asset availability %, site status counts, open alerts, and active work orders.';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => (object) [],
            'additionalProperties' => false,
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $sites = Site::query()->get();
        $output = $this->energy->latestOutputBySite();
        $todayEnergy = $this->energy->todayEnergyBySite();

        $assetsByStatus = Asset::query()->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status')->map(fn ($c) => (int) $c);
        $alertsBySeverity = Alert::query()->active()->selectRaw('severity, COUNT(*) as c')->groupBy('severity')->pluck('c', 'severity')->map(fn ($c) => (int) $c);
        $woByStatus = WorkOrder::query()->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status')->map(fn ($c) => (int) $c);

        $siteRows = $sites->map(function (Site $s) use ($output, $todayEnergy) {
            $kw = (float) $output->get($s->id, 0);
            $capKw = $s->capacityKw();

            return [
                'id' => $s->id,
                'name' => $s->name,
                'type' => $s->type->value,
                'status' => $s->status->value,
                'capacity_mw' => (float) $s->capacity_mw,
                'current_output_kw' => $kw,
                'capacity_factor_pct' => $capKw > 0 ? round($kw / $capKw * 100, 1) : 0.0,
                'today_energy_kwh' => round((float) $todayEnergy->get($s->id, 0), 1),
            ];
        });

        $fleetKw = round((float) $siteRows->sum('current_output_kw'), 1);
        $capKw = round((float) $sites->sum(fn (Site $s) => $s->capacityKw()), 1);
        $todayKwh = round((float) $siteRows->sum('today_energy_kwh'), 1);
        $totalAssets = (int) $assetsByStatus->sum();
        $onlineAssets = (int) $assetsByStatus->get(OperationalStatus::Online->value, 0);

        $byTech = $siteRows->groupBy('type')->map(fn ($rows) => [
            'kw' => round((float) $rows->sum('current_output_kw'), 1),
            'mw' => round((float) $rows->sum('current_output_kw') / 1000, 2),
            'capacity_kw' => round((float) $rows->sum('capacity_mw') * 1000, 1),
            'sites' => $rows->count(),
        ])->all();

        return [
            'timezone' => 'Asia/Karachi',
            'as_of' => $ctx->nowLocal,
            'fleet' => [
                'current_output_kw' => $fleetKw,
                'current_output_mw' => round($fleetKw / 1000, 2),
                'capacity_kw' => $capKw,
                'capacity_mw' => round($capKw / 1000, 2),
                'capacity_factor_pct' => $capKw > 0 ? round($fleetKw / $capKw * 100, 1) : 0.0,
                'today_energy_kwh' => $todayKwh,
                'today_energy_mwh' => round($todayKwh / 1000, 2),
                'availability_pct' => $totalAssets > 0 ? round($onlineAssets / $totalAssets * 100, 1) : 0.0,
                'total_sites' => $sites->count(),
                'total_assets' => $totalAssets,
            ],
            'sites_by_status' => $siteRows->countBy('status')->all(),
            'generation_by_technology' => $byTech,
            'open_alerts' => [
                'total' => (int) $alertsBySeverity->sum(),
                'by_severity' => $alertsBySeverity->all(),
            ],
            'work_orders' => [
                'by_status' => $woByStatus->all(),
            ],
        ];
    }
}

