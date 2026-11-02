<?php

namespace App\Services\Assistant\Tools;

use App\Models\Asset;
use App\Models\TelemetryReading;
use App\Services\Assistant\AssistantContext;
use Illuminate\Support\Facades\DB;

final class ListAssetsTool extends AbstractTool
{
    public function name(): string
    {
        return 'list_assets';
    }

    public function description(): string
    {
        return 'List generating units/assets ordered by lowest health score first, with latest power_kw, efficiency_pct, and temperature_c.';
    }

    public function parametersSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'site_id' => ['type' => 'integer'],
                'site' => ['type' => 'string'],
                'technology' => ['type' => 'string', 'enum' => ['hydro', 'solar', 'wind']],
                'kind' => ['type' => 'string', 'enum' => ['inverter', 'turbine', 'panel_string', 'transformer']],
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

        $site = $this->resolveSite($args);
        $siteId = $site?->id ?? (! empty($args['site_id']) ? (int) $args['site_id'] : null);
        $techs = $this->parseTechnologies($args);
        $kind = strtolower(trim((string) ($args['kind'] ?? '')));
        $status = strtolower(trim((string) ($args['status'] ?? '')));
        $q = trim((string) ($args['q'] ?? ''));

        $assets = Asset::query()
            ->with('site')
            ->when($siteId !== null, fn ($b) => $b->where('site_id', $siteId))
            ->when(count($techs) > 0, fn ($b) => $b->whereHas('site', fn ($sq) => $sq->whereIn('type', $techs)))
            ->when($kind !== '', fn ($b) => $b->where('kind', $kind))
            ->when($status !== '', fn ($b) => $b->where('status', $status))
            ->when($q !== '', fn ($b) => $b->where(fn ($sub) => $sub
                ->where('name', 'like', "%{$q}%")
                ->orWhere('tag', 'like', "%{$q}%")))
            ->orderBy('health_score')
            ->orderBy('id')
            ->limit(25)
            ->get();

        $assetIds = $assets->pluck('id')->all();
        $latestMap = collect();
        if (count($assetIds) > 0) {
            $latestSub = TelemetryReading::query()
                ->select('asset_id', DB::raw('MAX(recorded_at) as max_at'))
                ->whereIn('asset_id', $assetIds)
                ->groupBy('asset_id');

            $latestMap = TelemetryReading::query()
                ->joinSub($latestSub, 'l', fn ($j) => $j->on('telemetry_readings.asset_id', '=', 'l.asset_id')->on('telemetry_readings.recorded_at', '=', 'l.max_at'))
                ->get()
                ->keyBy('asset_id');
        }

        $rows = $assets->map(function (Asset $a) use ($latestMap) {
            $r = $latestMap->get($a->id);

            return [
                'id' => $a->id,
                'name' => $a->name,
                'tag' => $a->tag,
                'kind' => $a->kind->value,
                'status' => $a->status->value,
                'rated_kw' => (float) $a->rated_kw,
                'health_score' => (int) $a->health_score,
                'site_id' => $a->site_id,
                'site_name' => $a->site?->name,
                'technology' => $a->site?->type?->value,
                'power_kw' => $r ? round((float) $r->power_kw, 1) : 0.0,
                'efficiency_pct' => $r && $r->efficiency_pct !== null ? round((float) $r->efficiency_pct, 1) : null,
                'temperature_c' => $r && $r->temperature_c !== null ? round((float) $r->temperature_c, 1) : null,
            ];
        })->values()->all();

        return [
            'count' => count($rows),
            'assets' => $rows,
        ];
    }
}

