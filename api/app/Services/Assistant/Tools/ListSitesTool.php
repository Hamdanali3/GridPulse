<?php

namespace App\Services\Assistant\Tools;

use App\Models\Site;
use App\Services\Assistant\AssistantContext;
use App\Services\EnergyService;

final class ListSitesTool extends AbstractTool
{
    public function __construct(private readonly EnergyService $energy) {}

    public function name(): string
    {
        return 'list_sites';
    }

    public function description(): string
    {
        return 'List generation sites with live output (kW), today energy (kWh), capacity (MW), technology, and status.';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'technology' => ['type' => 'string', 'enum' => ['hydro', 'solar', 'wind']],
                'status' => ['type' => 'string', 'enum' => ['online', 'degraded', 'offline', 'maintenance']],
                'q' => ['type' => 'string'],
            ],
        ];
    }

    public function execute(array $args, AssistantContext $ctx): array
    {
        if ($denied = $this->enforceRole($ctx)) {
            return $denied;
        }

        $techs = $this->parseTechnologies($args);
        $status = strtolower(trim((string) ($args['status'] ?? '')));
        $q = trim((string) ($args['q'] ?? ''));

        $sites = Site::query()
            ->when(count($techs) > 0, fn ($b) => $b->whereIn('type', $techs))
            ->when($status !== '', fn ($b) => $b->where('status', $status))
            ->when($q !== '', fn ($b) => $b->where(fn ($sub) => $sub
                ->where('name', 'like', "%{$q}%")
                ->orWhere('code', 'like', "%{$q}%")
                ->orWhere('region', 'like', "%{$q}%")))
            ->withCount('assets')
            ->orderBy('name')
            ->limit(25)
            ->get();

        $output = $this->energy->latestOutputBySite();
        $todayEnergy = $this->energy->todayEnergyBySite();

        $rows = $sites->map(function (Site $s) use ($output, $todayEnergy) {
            $kw = round((float) $output->get($s->id, 0), 1);
            $capKw = $s->capacityKw();
            $kwh = round((float) $todayEnergy->get($s->id, 0), 1);

            return [
                'id' => $s->id,
                'name' => $s->name,
                'code' => $s->code,
                'technology' => $s->type->value,
                'status' => $s->status->value,
                'region' => $s->region,
                'capacity_mw' => (float) $s->capacity_mw,
                'assets_count' => (int) $s->assets_count,
                'current_output_kw' => $kw,
                'capacity_factor_pct' => $capKw > 0 ? round($kw / $capKw * 100, 1) : 0.0,
                'today_energy_kwh' => $kwh,
            ];
        })->values()->all();

        return [
            'count' => count($rows),
            'timezone' => 'Asia/Karachi',
            'sites' => $rows,
        ];
    }
}
