<?php

namespace App\Services;

use App\Enums\AlertStatus;
use App\Enums\AlertType;
use App\Enums\OperationalStatus;
use App\Enums\Severity;
use App\Enums\SiteType;
use App\Models\Alert;
use App\Models\Asset;
use App\Models\Site;
use App\Models\TelemetryReading;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * GridPulse has no real SCADA feed, so this service plays the role of the field devices.
 *
 * Every tick it produces one physically plausible reading per asset, persists them in a single
 * insert, evaluates the alert rules, and nudges each asset's health score. The same generator
 * back-fills seven days of history in the seeder, so charts look continuous from the first run.
 * The noise function is deterministic (seeded by asset id and time) so history is reproducible.
 */
class TelemetrySimulator
{
    /** @return array{inserted:int, alerts:int} */
    public function tick(?CarbonInterface $at = null): array
    {
        $at = $at ?? now();
        $sites = Site::query()->get()->keyBy('id');
        $assets = Asset::query()->get();

        if ($assets->isEmpty()) {
            return ['inserted' => 0, 'alerts' => 0];
        }

        $rows = [];
        $candidates = [];
        $healthUpdates = [];

        foreach ($assets as $asset) {
            $site = $sites->get($asset->site_id);
            if (! $site) {
                continue;
            }
            $reading = $this->generate($asset, $site, $at);
            $rows[] = $reading;

            foreach ($this->evaluate($reading, $asset, $site) as $rule) {
                $candidates[] = $rule + ['site_id' => $site->id, 'asset_id' => $asset->id];
            }

            // Health is an exponential moving average of efficiency: it moves slowly, and it
            // never feeds back into the efficiency calculation, so it cannot spiral.
            if ($reading['efficiency_pct'] > 0) {
                $target = min(100, $reading['efficiency_pct'] + 4);
                $next = round($asset->health_score * 0.95 + $target * 0.05, 1);
                if (abs($next - $asset->health_score) >= 0.1) {
                    $healthUpdates[$asset->id] = $next;
                }
            }
        }

        $created = 0;
        DB::transaction(function () use ($rows, $healthUpdates, $candidates, &$created) {
            TelemetryReading::insert($rows);
            foreach ($healthUpdates as $id => $health) {
                Asset::whereKey($id)->update(['health_score' => $health]);
            }
            $created = $this->raiseAlerts($candidates);
        });

        return ['inserted' => count($rows), 'alerts' => $created];
    }

    /**
     * One reading for one asset at a point in time.
     *
     * @return array<string, mixed>
     */
    public function generate(Asset $asset, Site $site, CarbonInterface $ts): array
    {
        $seed = (string) $asset->id;
        $minute = $ts->getTimestamp() / 60;
        $health = max(0.2, ($asset->health_score ?: 100) / 100);
        $temperature = 22 + $this->noise($seed, $minute, 2);

        $base = [
            'asset_id' => $asset->id,
            'site_id' => $site->id,
            'recorded_at' => $ts->toDateTimeString(),
            'irradiance_wm2' => $site->type === SiteType::Solar ? $this->irradianceAt($ts, (float) $site->lng) : null,
            'wind_speed_ms' => $site->type === SiteType::Wind ? $this->windSpeedAt($ts, (string) $site->id) : null,
        ];

        $stopped = in_array($asset->status, [OperationalStatus::Offline, OperationalStatus::Maintenance], true)
            || $site->status === OperationalStatus::Offline;

        if ($stopped) {
            return $base + ['power_kw' => 0, 'efficiency_pct' => 0, 'temperature_c' => round($temperature, 1)];
        }

        $degraded = ($asset->status === OperationalStatus::Degraded || $site->status === OperationalStatus::Degraded) ? 0.72 : 1;
        $power = 0;
        $efficiency = 0;

        if ($site->type === SiteType::Solar) {
            $irr = $base['irradiance_wm2'];
            $cloud = 1 - max(0, $this->noise($seed, $minute / 20, 0.25));
            $cf = ($irr / 1000) * $cloud * $health * $degraded;
            $power = $asset->rated_kw * $cf;
            $efficiency = $irr > 50 ? 96 * $degraded + $this->noise($seed, $minute, 2) : 0;
            $temperature = 22 + $irr / 28 + $this->noise($seed, $minute, 3) + ($degraded < 1 ? 14 : 0);
        } elseif ($site->type === SiteType::Wind) {
            $wind = $base['wind_speed_ms'];
            // Simplified turbine power curve: cut-in 3 m/s, rated 12 m/s, cut-out 25 m/s.
            $cf = 0;
            if ($wind >= 3 && $wind <= 25) {
                $cf = $wind >= 12 ? 1 : (($wind - 3) / 9) ** 3;
            }
            $power = $asset->rated_kw * $cf * $health * $degraded;
            $efficiency = $cf > 0 ? 94 * $degraded + $this->noise($seed, $minute, 2) : 0;
            $temperature = 30 + $cf * 20 + $this->noise($seed, $minute, 3) + ($degraded < 1 ? 16 : 0);
        } else {
            // Hydro: steady base load with a slow drift.
            $cf = 0.82 + 0.08 * sin($minute / 400) + $this->noise($seed, $minute / 10, 0.03);
            $power = $asset->rated_kw * $cf * $health * $degraded;
            $efficiency = 91 * $degraded + $this->noise($seed, $minute, 1.5);
            $temperature = 35 + $this->noise($seed, $minute, 2) + ($degraded < 1 ? 12 : 0);
        }

        return $base + [
            'power_kw' => round(max(0, $power), 1),
            'efficiency_pct' => round(min(100, max(0, $efficiency)), 1),
            'temperature_c' => round($temperature, 1),
        ];
    }

    /**
     * Alert rules. Returns zero or more rule hits for one reading.
     *
     * @param  array<string, mixed>  $r
     * @return list<array{type:string, severity:string, message:string, value:float}>
     */
    public function evaluate(array $r, Asset $asset, Site $site): array
    {
        $hits = [];
        $producing = $site->type !== SiteType::Solar || ($r['irradiance_wm2'] ?? 0) > 150;
        $name = $asset->name;

        if ($asset->status === OperationalStatus::Offline) {
            return [[
                'type' => AlertType::AssetOffline->value,
                'severity' => Severity::Critical->value,
                'message' => "{$name} is offline and not generating.",
                'value' => 0.0,
            ]];
        }

        if ($producing && $r['efficiency_pct'] > 0 && $r['efficiency_pct'] < $site->min_efficiency) {
            $gap = $site->min_efficiency - $r['efficiency_pct'];
            $hits[] = [
                'type' => AlertType::LowEfficiency->value,
                'severity' => $gap > 15 ? Severity::Critical->value : Severity::Warning->value,
                'message' => sprintf('%s efficiency dropped to %.1f%% (threshold %d%%).', $name, $r['efficiency_pct'], $site->min_efficiency),
                'value' => (float) $r['efficiency_pct'],
            ];
        }

        if ($r['temperature_c'] > $site->max_temperature) {
            $over = $r['temperature_c'] - $site->max_temperature;
            $hits[] = [
                'type' => AlertType::HighTemperature->value,
                'severity' => $over > 10 ? Severity::Critical->value : Severity::Warning->value,
                'message' => sprintf('%s is running hot at %.1f °C (limit %d °C).', $name, $r['temperature_c'], $site->max_temperature),
                'value' => (float) $r['temperature_c'],
            ];
        }

        if ($producing && $asset->status === OperationalStatus::Online && $site->status === OperationalStatus::Online && $r['power_kw'] == 0) {
            $hits[] = [
                'type' => AlertType::ZeroOutput->value,
                'severity' => Severity::Warning->value,
                'message' => "{$name} reports zero output while marked online.",
                'value' => 0.0,
            ];
        }

        return $hits;
    }

    /**
     * Creates alerts only when no open or acknowledged alert of the same type exists for the asset.
     *
     * @param  list<array<string, mixed>>  $candidates
     */
    private function raiseAlerts(array $candidates): int
    {
        if ($candidates === []) {
            return 0;
        }
        $assetIds = array_unique(array_column($candidates, 'asset_id'));
        $open = Alert::query()
            ->whereIn('asset_id', $assetIds)
            ->whereIn('status', [AlertStatus::Open->value, AlertStatus::Acknowledged->value])
            ->get(['asset_id', 'type'])
            ->map(fn (Alert $a) => $a->asset_id.':'.$a->type->value)
            ->flip();

        $fresh = array_values(array_filter($candidates, fn ($c) => ! $open->has($c['asset_id'].':'.$c['type'])));
        if ($fresh === []) {
            return 0;
        }
        $now = now();
        Alert::insert(array_map(fn ($c) => $c + ['status' => AlertStatus::Open->value, 'created_at' => $now, 'updated_at' => $now], $fresh));

        return count($fresh);
    }

    /** Deterministic pseudo-random noise in [-amplitude, amplitude], seeded by id and time. */
    private function noise(string $seed, float $t, float $amplitude = 1): float
    {
        $h = crc32($seed.':'.(int) floor($t));
        $unit = ($h % 10000) / 10000; // 0..1

        return ($unit - 0.5) * 2 * $amplitude;
    }

    /** Solar irradiance follows a daylight bell curve, shifted to local solar time by longitude. */
    private function irradianceAt(CarbonInterface $ts, float $lng): float
    {
        $utcHours = $ts->hour + $ts->minute / 60;
        $local = fmod($utcHours + $lng / 15 + 24, 24);
        $x = ($local - 6) / 14; // daylight 06:00 → 20:00
        if ($x <= 0 || $x >= 1) {
            return 0;
        }

        return round(1000 * (sin(M_PI * $x) ** 1.4));
    }

    /** Wind drifts slowly through the day with a site-specific phase. */
    private function windSpeedAt(CarbonInterface $ts, string $siteSeed): float
    {
        $hours = $ts->getTimestamp() / 3600;
        $base = 8 + 4 * sin($hours / 6 + $this->noise($siteSeed, 0, 3));

        return max(0, round($base + $this->noise($siteSeed, $hours * 4, 1.5), 1));
    }

    /**
     * Back-fill history for the seeder. Coarse for the bulk of the window, dense for the last 30 minutes.
     *
     * @param  Collection<int, Asset>  $assets
     */
    public function backfill(Collection $assets, Collection $sites, int $days = 7): int
    {
        $now = now();
        $rows = [];
        $count = 0;
        $flush = function () use (&$rows, &$count) {
            if ($rows !== []) {
                foreach (array_chunk($rows, 500) as $chunk) {
                    TelemetryReading::insert($chunk);
                }
                $count += count($rows);
                $rows = [];
            }
        };

        $start = $now->copy()->subDays($days);
        $dense = $now->copy()->subMinutes(30);

        for ($t = $start->copy(); $t->lt($dense); $t->addMinutes(5)) {
            foreach ($assets as $asset) {
                $rows[] = $this->generate($asset, $sites->get($asset->site_id), $t);
            }
            if (count($rows) >= 2000) {
                $flush();
            }
        }
        for ($t = $dense->copy(); $t->lte($now); $t->addSeconds(5)) {
            foreach ($assets as $asset) {
                $rows[] = $this->generate($asset, $sites->get($asset->site_id), $t);
            }
            if (count($rows) >= 2000) {
                $flush();
            }
        }
        $flush();

        return $count;
    }
}
