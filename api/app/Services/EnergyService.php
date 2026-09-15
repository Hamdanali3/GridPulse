<?php

namespace App\Services;

use App\Models\TelemetryReading;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Read-side telemetry aggregations. Everything here is a single grouped query; the client
 * polls these endpoints, so they must stay cheap.
 */
class EnergyService
{
    /**
     * Latest reading per asset within the last two minutes, summed per site.
     *
     * @param  list<int>|null  $siteIds
     * @return Collection<int, float> site_id => kW
     */
    public function latestOutputBySite(?array $siteIds = null): Collection
    {
        $since = now()->subMinutes(2);
        $latest = TelemetryReading::query()
            ->select('asset_id', DB::raw('MAX(recorded_at) as max_at'))
            ->where('recorded_at', '>=', $since)
            ->when($siteIds !== null, fn ($q) => $q->whereIn('site_id', $siteIds))
            ->groupBy('asset_id');

        return TelemetryReading::query()
            ->joinSub($latest, 'l', fn ($join) => $join->on('telemetry_readings.asset_id', '=', 'l.asset_id')->on('telemetry_readings.recorded_at', '=', 'l.max_at'))
            ->select('site_id', DB::raw('SUM(power_kw) as kw'))
            ->groupBy('site_id')
            ->pluck('kw', 'site_id')
            ->map(fn ($kw) => round((float) $kw, 1));
    }

    /** @return array{fleet_kw: float, reporting_assets: int, recorded_at: ?string} */
    public function fleetLive(): array
    {
        $since = now()->subMinutes(2);
        $latest = TelemetryReading::query()
            ->select('asset_id', DB::raw('MAX(recorded_at) as max_at'))
            ->where('recorded_at', '>=', $since)
            ->groupBy('asset_id');

        $row = TelemetryReading::query()
            ->joinSub($latest, 'l', fn ($join) => $join->on('telemetry_readings.asset_id', '=', 'l.asset_id')->on('telemetry_readings.recorded_at', '=', 'l.max_at'))
            ->selectRaw('SUM(power_kw) as kw, COUNT(*) as assets, MAX(recorded_at) as ts')
            ->first();

        return [
            'fleet_kw' => round((float) ($row->kw ?? 0), 1),
            'reporting_assets' => (int) ($row->assets ?? 0),
            'recorded_at' => $row?->ts ? \Carbon\Carbon::parse($row->ts)->toISOString() : null,
        ];
    }

    /**
     * Fleet (or one site) output bucketed by N minutes: average per asset per bucket, then summed.
     *
     * @return list<array{ts:string, kw:float, efficiency_pct?:float, temperature_c?:float}>
     */
    public function series(CarbonInterface $from, int $bucketMinutes, ?int $siteId = null, bool $withQuality = false): array
    {
        $bucketSeconds = $bucketMinutes * 60;
        $driver = DB::connection()->getDriverName();

        // Epoch seconds floored to the bucket, expressed per database engine.
        $bucketExpr = match ($driver) {
            'mysql', 'mariadb' => "FLOOR(UNIX_TIMESTAMP(recorded_at) / {$bucketSeconds}) * {$bucketSeconds}",
            'pgsql' => "FLOOR(EXTRACT(EPOCH FROM recorded_at) / {$bucketSeconds}) * {$bucketSeconds}",
            default => "CAST(strftime('%s', recorded_at) AS INTEGER) / {$bucketSeconds} * {$bucketSeconds}",
        };

        $perAsset = TelemetryReading::query()
            ->selectRaw("{$bucketExpr} as bucket, asset_id, AVG(power_kw) as kw, AVG(efficiency_pct) as eff, AVG(temperature_c) as temp")
            ->where('recorded_at', '>=', $from)
            ->when($siteId !== null, fn ($q) => $q->where('site_id', $siteId))
            ->groupBy('bucket', 'asset_id');

        $rows = DB::query()
            ->fromSub($perAsset, 'p')
            ->selectRaw('bucket, SUM(kw) as kw, AVG(eff) as eff, AVG(temp) as temp')
            ->groupBy('bucket')
            ->orderBy('bucket')
            ->get();

        return $rows->map(function ($r) use ($withQuality) {
            $point = ['ts' => \Carbon\Carbon::createFromTimestamp((int) $r->bucket)->toISOString(), 'kw' => round((float) $r->kw, 1)];
            if ($withQuality) {
                $point['efficiency_pct'] = round((float) $r->eff, 1);
                $point['temperature_c'] = round((float) $r->temp, 1);
            }

            return $point;
        })->all();
    }

    /**
     * Fleet output bucketed by N minutes and split by technology (solar / wind / hydro).
     *
     * @return list<array{ts:string, solar:float, wind:float, hydro:float}>
     */
    public function seriesByType(CarbonInterface $from, int $bucketMinutes): array
    {
        $bucketSeconds = $bucketMinutes * 60;
        $driver = DB::connection()->getDriverName();
        $bucketExpr = match ($driver) {
            'mysql', 'mariadb' => "FLOOR(UNIX_TIMESTAMP(recorded_at) / {$bucketSeconds}) * {$bucketSeconds}",
            'pgsql' => "FLOOR(EXTRACT(EPOCH FROM recorded_at) / {$bucketSeconds}) * {$bucketSeconds}",
            default => "CAST(strftime('%s', recorded_at) AS INTEGER) / {$bucketSeconds} * {$bucketSeconds}",
        };

        $perAsset = TelemetryReading::query()
            ->selectRaw("{$bucketExpr} as bucket, asset_id, site_id, AVG(power_kw) as kw")
            ->where('recorded_at', '>=', $from)
            ->groupBy('bucket', 'asset_id', 'site_id');

        $rows = DB::query()
            ->fromSub($perAsset, 'p')
            ->join('sites', 'sites.id', '=', 'p.site_id')
            ->selectRaw('bucket, sites.type as type, SUM(kw) as kw')
            ->groupBy('bucket', 'sites.type')
            ->orderBy('bucket')
            ->get();

        $points = [];
        foreach ($rows as $r) {
            $key = (int) $r->bucket;
            $points[$key] ??= ['ts' => \Carbon\Carbon::createFromTimestamp($key)->toISOString(), 'solar' => 0.0, 'wind' => 0.0, 'hydro' => 0.0];
            $points[$key][$r->type] = round((float) $r->kw, 1);
        }

        return array_values($points);
    }

    /**
     * Compact per-site series for sparklines: one kW value per bucket per site, oldest first.
     *
     * @return array<int, list<float>> site_id => [kw, kw, ...]
     */
    public function sparklines(CarbonInterface $from, int $bucketMinutes): array
    {
        $bucketSeconds = $bucketMinutes * 60;
        $driver = DB::connection()->getDriverName();
        $bucketExpr = match ($driver) {
            'mysql', 'mariadb' => "FLOOR(UNIX_TIMESTAMP(recorded_at) / {$bucketSeconds}) * {$bucketSeconds}",
            'pgsql' => "FLOOR(EXTRACT(EPOCH FROM recorded_at) / {$bucketSeconds}) * {$bucketSeconds}",
            default => "CAST(strftime('%s', recorded_at) AS INTEGER) / {$bucketSeconds} * {$bucketSeconds}",
        };

        $perAsset = TelemetryReading::query()
            ->selectRaw("{$bucketExpr} as bucket, site_id, asset_id, AVG(power_kw) as kw")
            ->where('recorded_at', '>=', $from)
            ->groupBy('bucket', 'site_id', 'asset_id');

        $rows = DB::query()
            ->fromSub($perAsset, 'p')
            ->selectRaw('bucket, site_id, SUM(kw) as kw')
            ->groupBy('bucket', 'site_id')
            ->orderBy('bucket')
            ->get();

        $out = [];
        foreach ($rows as $r) {
            $out[(int) $r->site_id][] = round((float) $r->kw, 1);
        }

        return $out;
    }

    /**
     * Energy in kWh between two instants, grouped by site, technology or day.
     * Model: average power per asset per day × hours spanned by its readings that day (left Riemann sum).
     *
     * @return list<array{key:string, kwh:float, day?:string, site_id?:int}>
     */
    public function energy(CarbonInterface $from, CarbonInterface $to, string $groupBy = 'site', ?array $siteIds = null): array
    {
        $driver = DB::connection()->getDriverName();
        $dayExpr = match ($driver) {
            'mysql', 'mariadb' => "DATE_FORMAT(recorded_at, '%Y-%m-%d')",
            'pgsql' => "TO_CHAR(recorded_at, 'YYYY-MM-DD')",
            default => "strftime('%Y-%m-%d', recorded_at)",
        };
        $hoursExpr = match ($driver) {
            'mysql', 'mariadb' => 'TIMESTAMPDIFF(SECOND, MIN(recorded_at), MAX(recorded_at)) / 3600.0',
            'pgsql' => 'EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0',
            default => "(strftime('%s', MAX(recorded_at)) - strftime('%s', MIN(recorded_at))) / 3600.0",
        };

        $perAssetDay = TelemetryReading::query()
            ->selectRaw("asset_id, site_id, {$dayExpr} as day, AVG(power_kw) * {$hoursExpr} as kwh, AVG(efficiency_pct) as eff, MAX(power_kw) as peak")
            ->whereBetween('recorded_at', [$from, $to])
            ->when($siteIds !== null, fn ($q) => $q->whereIn('site_id', $siteIds))
            ->groupBy('asset_id', 'site_id', 'day');

        $query = DB::query()->fromSub($perAssetDay, 'e');

        $rows = match ($groupBy) {
            'day' => $query->selectRaw('day as k, SUM(kwh) as kwh')->groupBy('day')->orderBy('day')->get(),
            'type' => $query->join('sites', 'sites.id', '=', 'e.site_id')->selectRaw('sites.type as k, SUM(kwh) as kwh')->groupBy('sites.type')->orderBy('sites.type')->get(),
            'site_day' => $query->selectRaw('site_id as k, day, SUM(kwh) as kwh, AVG(eff) as eff, SUM(peak) as peak')->groupBy('site_id', 'day')->orderBy('day')->orderBy('site_id')->get(),
            default => $query->selectRaw('site_id as k, SUM(kwh) as kwh')->groupBy('site_id')->orderBy('site_id')->get(),
        };

        return $rows->map(fn ($r) => array_filter([
            'key' => (string) $r->k,
            'kwh' => round((float) $r->kwh, 1),
            'day' => $r->day ?? null,
            'avg_efficiency' => isset($r->eff) ? round((float) $r->eff, 1) : null,
            'peak_kw' => isset($r->peak) ? round((float) $r->peak, 1) : null,
        ], fn ($v) => $v !== null))->all();
    }

    /** @return Collection<int, float> site_id => kWh since midnight UTC */
    public function todayEnergyBySite(?array $siteIds = null): Collection
    {
        $rows = $this->energy(now()->startOfDay(), now(), 'site', $siteIds);

        return collect($rows)->mapWithKeys(fn ($r) => [(int) $r['key'] => $r['kwh']]);
    }
}
