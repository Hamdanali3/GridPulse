<?php

namespace App\Services\Assistant\Tools;

use App\Enums\OperationalStatus;
use App\Models\Alert;
use App\Models\Asset;
use App\Models\TelemetryReading;
use App\Models\WorkOrder;
use App\Services\Assistant\AssistantContext;
use App\Services\Assistant\DateRangeResolver;
use App\Services\EnergyService;
use Illuminate\Support\Facades\DB;

final class SiteSummaryTool extends AbstractTool
{
    public function __construct(private readonly EnergyService $energy) {}

    public function name(): string
    {
        return 'site_summary';
    }

    public function description(): string
    {
        return 'Get detailed live output, energy (kWh/MWh), efficiency %, temperature, asset health breakdown, open alerts, and active work orders for one site by ID or fuzzy name.';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'site_id' => ['type' => 'integer', 'description' => 'Numeric site ID'],
                'name' => ['type' => 'string', 'description' => 'Site name or code (e.g. Golen Gol, Lawi, Mastuj)'],
                'range' => ['type' => 'string', 'description' => '24h, 3d, or 7d'],
            ],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $site = $this->resolveSite($args);
        if (! $site) {
            return [
                'found' => false,
                'message' => 'No matching site found. Use `list_sites` to inspect available Chitral plants.',
            ];
        }

        $win = DateRangeResolver::resolve($args, '24h');
        $liveKw = (float) ($this->energy->latestOutputBySite([$site->id])->get($site->id, 0));
        $capKw = $site->capacityKw();

        $energyRows = $this->energy->energy($win['from'], $win['to'], 'site', [$site->id]);
        $windowKwh = round((float) collect($energyRows)->sum('kwh'), 1);

        $latestSub = TelemetryReading::query()
            ->select('asset_id', DB::raw('MAX(recorded_at) as max_at'))
            ->where('site_id', $site->id)
            ->where('recorded_at', '>=', now()->subHours(24))
            ->groupBy('asset_id');

        $qual = TelemetryReading::query()
            ->joinSub($latestSub, 'l', fn ($j) => $j->on('telemetry_readings.asset_id', '=', 'l.asset_id')->on('telemetry_readings.recorded_at', '=', 'l.max_at'))
            ->selectRaw('AVG(efficiency_pct) as avg_eff, AVG(temperature_c) as avg_temp')
            ->first();

        $assets = Asset::query()->where('site_id', $site->id)->orderBy('health_score')->get();
        $totalAssets = $assets->count();
        $onlineAssets = $assets->where('status', OperationalStatus::Online)->count();

        return [
            'found' => true,
            'window' => [
                'from' => $win['from']->toDateString(),
                'to' => $win['to']->toDateString(),
                'label' => $win['label'],
                'timezone' => 'Asia/Karachi',
            ],
            'site' => [
                'id' => $site->id,
                'name' => $site->name,
                'code' => $site->code,
                'technology' => $site->type->value,
                'status' => $site->status->value,
                'region' => $site->region,
                'capacity_mw' => (float) $site->capacity_mw,
                'capacity_kw' => $capKw,
                'min_efficiency_pct' => (float) $site->min_efficiency,
                'max_temperature_c' => (float) $site->max_temperature,
            ],
            'metrics' => [
                'current_output_kw' => round($liveKw, 1),
                'current_output_mw' => round($liveKw / 1000, 2),
                'capacity_factor_pct' => $capKw > 0 ? round($liveKw / $capKw * 100, 1) : 0.0,
                'window_energy_kwh' => $windowKwh,
                'window_energy_mwh' => round($windowKwh / 1000, 2),
                'availability_pct' => $totalAssets > 0 ? round($onlineAssets / $totalAssets * 100, 1) : 0.0,
                'avg_efficiency_pct' => $qual?->avg_eff !== null ? round((float) $qual->avg_eff, 1) : null,
                'avg_temperature_c' => $qual?->avg_temp !== null ? round((float) $qual->avg_temp, 1) : null,
                'open_alerts' => Alert::query()->where('site_id', $site->id)->active()->count(),
                'open_work_orders' => WorkOrder::query()->where('site_id', $site->id)->where('status', '!=', 'done')->count(),
            ],
            'assets' => $assets->take(12)->map(fn (Asset $a) => [
                'id' => $a->id,
                'name' => $a->name,
                'tag' => $a->tag,
                'kind' => $a->kind->value,
                'status' => $a->status->value,
                'rated_kw' => (float) $a->rated_kw,
                'health_score' => (int) $a->health_score,
            ])->values()->all(),
        ];
    }
}
