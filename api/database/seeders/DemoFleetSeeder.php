<?php

namespace Database\Seeders;

use App\Enums\AlertStatus;
use App\Enums\AlertType;
use App\Enums\OperationalStatus;
use App\Enums\Priority;
use App\Enums\Role;
use App\Enums\Severity;
use App\Enums\SiteType;
use App\Enums\WorkOrderStatus;
use App\Models\Alert;
use App\Models\Asset;
use App\Models\AuditLog;
use App\Models\Site;
use App\Models\User;
use App\Models\WorkOrder;
use App\Services\TelemetrySimulator;
use Illuminate\Database\Seeder;

/**
 * A realistic demo fleet for Chitral district: 3 accounts, 11 sites (hydro, solar, one wind pilot),
 * ~30 assets, seven days of telemetry, alerts derived from the latest readings and work orders.
 */
class DemoFleetSeeder extends Seeder
{
    public const ACCOUNTS = [
        ['name' => 'Muhammad Zafar', 'email' => 'admin@gridpulse.io', 'password' => 'Admin12345', 'role' => Role::Admin],
        ['name' => 'Shahzada Iqbal', 'email' => 'engineer@gridpulse.io', 'password' => 'Engineer12345', 'role' => Role::Engineer],
        ['name' => 'Sadia Rehman', 'email' => 'viewer@gridpulse.io', 'password' => 'Viewer12345', 'role' => Role::Viewer],
    ];

    /**
     * Chitral district, Khyber Pakhtunkhwa. Hydro dominates (the district sits on the Chitral / Kunar
     * river system in the Hindu Kush), solar covers the high, dry valleys, and one small wind pilot
     * sits on the Shandur plateau. Capacities are indicative; coordinates are real locations.
     */
    private const SITES = [
        ['name' => 'Golen Gol Hydropower', 'short' => 'Golen Gol', 'code' => 'HYD-CH-01', 'type' => 'hydro', 'capacity_mw' => 108, 'status' => 'online', 'lat' => 35.9850, 'lng' => 72.0150, 'region' => 'Lower Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2018-03-15'],
        ['name' => 'Lawi Hydropower', 'short' => 'Lawi', 'code' => 'HYD-CH-02', 'type' => 'hydro', 'capacity_mw' => 69, 'status' => 'maintenance', 'lat' => 35.8990, 'lng' => 71.9560, 'region' => 'Lower Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2025-11-01'],
        ['name' => 'Reshun Hydropower', 'short' => 'Reshun', 'code' => 'HYD-CH-03', 'type' => 'hydro', 'capacity_mw' => 4.2, 'status' => 'online', 'lat' => 36.1480, 'lng' => 72.2560, 'region' => 'Upper Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2015-06-20'],
        ['name' => 'Shishi Hydropower', 'short' => 'Shishi', 'code' => 'HYD-CH-04', 'type' => 'hydro', 'capacity_mw' => 1.8, 'status' => 'online', 'lat' => 35.5530, 'lng' => 71.8460, 'region' => 'Lower Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2012-09-10'],
        ['name' => 'Chitral Town Hydro', 'short' => 'Chitral Town', 'code' => 'HYD-CH-05', 'type' => 'hydro', 'capacity_mw' => 1.0, 'status' => 'degraded', 'lat' => 35.8510, 'lng' => 71.7860, 'region' => 'Lower Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2009-04-02'],
        ['name' => 'Bumburet Micro-Hydro', 'short' => 'Bumburet', 'code' => 'HYD-CH-06', 'type' => 'hydro', 'capacity_mw' => 0.8, 'status' => 'online', 'lat' => 35.7010, 'lng' => 71.6790, 'region' => 'Kalash Valleys', 'country' => 'Pakistan', 'commissioned_at' => '2016-10-12'],
        ['name' => 'Garam Chashma Micro-Hydro', 'short' => 'Garam Chashma', 'code' => 'HYD-CH-07', 'type' => 'hydro', 'capacity_mw' => 0.5, 'status' => 'online', 'lat' => 36.0230, 'lng' => 71.5560, 'region' => 'Lower Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2014-07-08'],
        ['name' => 'Mastuj Solar Park', 'short' => 'Mastuj', 'code' => 'SOL-CH-01', 'type' => 'solar', 'capacity_mw' => 2.0, 'status' => 'online', 'lat' => 36.2830, 'lng' => 72.5200, 'region' => 'Upper Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2022-05-18'],
        ['name' => 'Booni Solar Field', 'short' => 'Booni', 'code' => 'SOL-CH-02', 'type' => 'solar', 'capacity_mw' => 1.5, 'status' => 'online', 'lat' => 36.3040, 'lng' => 72.2790, 'region' => 'Upper Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2023-03-30'],
        ['name' => 'Drosh Solar Array', 'short' => 'Drosh', 'code' => 'SOL-CH-03', 'type' => 'solar', 'capacity_mw' => 1.0, 'status' => 'online', 'lat' => 35.5620, 'lng' => 71.7920, 'region' => 'Lower Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2021-11-05'],
        ['name' => 'Shandur Wind Pilot', 'short' => 'Shandur', 'code' => 'WND-CH-01', 'type' => 'wind', 'capacity_mw' => 0.6, 'status' => 'online', 'lat' => 36.0760, 'lng' => 72.5220, 'region' => 'Upper Chitral', 'country' => 'Pakistan', 'commissioned_at' => '2024-08-14'],
    ];

    private const MANUFACTURERS = [
        'inverter' => ['Huawei SUN2000', 'Sungrow SG110', 'SMA Sunny Tripower'],
        'turbine' => ['Vestas V27', 'Enercon E-30', 'Goldwind GW77'],
        'transformer' => ['Andritz Francis', 'Voith Pelton', 'Gilkes Turgo'],
    ];

    public function run(): void
    {
        $this->command?->info('Creating accounts');
        $users = collect(self::ACCOUNTS)->map(fn ($a) => User::create($a + ['last_login_at' => now()->subHours(3)]));
        [$admin, $engineer] = [$users[0], $users[1]];

        $this->command?->info('Creating sites and assets');
        $shortNames = collect(self::SITES)->pluck('short', 'code');
        $sites = collect(self::SITES)->map(fn ($s) => Site::create(collect($s)->except('short')->all() + ['created_by' => $admin->id]))->keyBy('id');
        $assets = $sites->flatMap(fn (Site $site) => $this->assetsFor($site, $shortNames->get($site->code)))->map(fn ($a) => Asset::create($a));

        $this->command?->info('Back-filling seven days of telemetry (this takes a moment)');
        $simulator = app(TelemetrySimulator::class);
        $count = $simulator->backfill($assets, $sites);
        $this->command?->info("Inserted {$count} readings");

        $this->command?->info('Evaluating alert rules on the latest readings');
        Alert::query()->delete(); // a running scheduler may have ticked while we were seeding
        $now = now();
        $alertRows = [];
        foreach ($assets as $asset) {
            $site = $sites->get($asset->site_id);
            $reading = $simulator->generate($asset, $site, $now);
            foreach ($simulator->evaluate($reading, $asset, $site) as $rule) {
                $alertRows[] = $rule + ['site_id' => $site->id, 'asset_id' => $asset->id, 'status' => AlertStatus::Open->value];
            }
        }
        $alerts = collect($alertRows)->map(fn ($r) => Alert::create($r));

        // Historical examples so the alert list shows every lifecycle state.
        $solarTx = $sites->firstWhere('code', 'SOL-CH-02');
        $solarTxAsset = $assets->firstWhere('site_id', $solarTx->id);
        Alert::create(['site_id' => $solarTx->id, 'asset_id' => $solarTxAsset->id, 'type' => AlertType::HighTemperature, 'severity' => Severity::Warning, 'status' => AlertStatus::Resolved, 'message' => "{$solarTxAsset->name} ran hot at 68.4 °C (limit 65 °C).", 'value' => 68.4, 'acknowledged_by' => $engineer->id, 'acknowledged_at' => $now->copy()->subHours(26), 'resolved_by' => $engineer->id, 'resolved_at' => $now->copy()->subHours(20), 'created_at' => $now->copy()->subHours(27)]);
        Alert::create(['site_id' => $solarTx->id, 'asset_id' => $solarTxAsset->id, 'type' => AlertType::LowEfficiency, 'severity' => Severity::Warning, 'status' => AlertStatus::Acknowledged, 'message' => "{$solarTxAsset->name} efficiency dropped to 66.2% (threshold 70%).", 'value' => 66.2, 'acknowledged_by' => $engineer->id, 'acknowledged_at' => $now->copy()->subHours(3), 'created_at' => $now->copy()->subHours(5)]);

        $this->command?->info('Creating work orders');
        $offlineAlert = $alerts->first(fn (Alert $a) => $a->type === AlertType::AssetOffline);
        $lawi = $sites->firstWhere('code', 'HYD-CH-02');
        $lawiAsset = $assets->firstWhere('site_id', $lawi->id);
        $mastuj = $sites->firstWhere('code', 'SOL-CH-01');
        $golen = $sites->firstWhere('code', 'HYD-CH-01');
        $bumburet = $sites->firstWhere('code', 'HYD-CH-06');

        $orders = [
            ['title' => 'Commissioning tests on Lawi unit 01', 'description' => 'Wet commissioning of the first 34.5 MW unit: governor response, over-speed trip and synchronisation with the 132 kV line to Chitral grid station.', 'priority' => Priority::High, 'status' => WorkOrderStatus::InProgress, 'site_id' => $lawi->id, 'asset_id' => $lawiAsset->id, 'assignee_id' => $engineer->id, 'created_by' => $admin->id, 'due_at' => $now->copy()->addDays(2)],
            ['title' => 'Clear snow and dust from Mastuj panel rows', 'description' => 'Soiling losses estimated at 9% after the dust storm. Manual wash of rows 1 to 4 with the water bowser from Booni.', 'priority' => Priority::Medium, 'status' => WorkOrderStatus::Planned, 'site_id' => $mastuj->id, 'assignee_id' => $engineer->id, 'created_by' => $admin->id, 'due_at' => $now->copy()->addDays(5)],
            ['title' => 'Investigate offline unit at Reshun', 'description' => $offlineAlert?->message ?? 'Unit stopped reporting.', 'priority' => Priority::Urgent, 'status' => WorkOrderStatus::Blocked, 'site_id' => $offlineAlert?->site_id ?? $lawi->id, 'asset_id' => $offlineAlert?->asset_id ?? $lawiAsset->id, 'alert_id' => $offlineAlert?->id, 'assignee_id' => $engineer->id, 'created_by' => $admin->id, 'due_at' => $now->copy()->addDay()],
            ['title' => 'Desilting of Golen Gol intake basin', 'description' => 'Seasonal glacial-melt silt load is high. Flush the settling basin and inspect the trash rack before peak summer flow.', 'priority' => Priority::Low, 'status' => WorkOrderStatus::Done, 'site_id' => $golen->id, 'assignee_id' => $engineer->id, 'created_by' => $admin->id, 'due_at' => $now->copy()->subDays(3)],
            ['title' => 'Replace Pelton runner buckets at Bumburet', 'description' => 'Cavitation pitting found on four buckets during the spring inspection. Spare runner is in the Chitral store.', 'priority' => Priority::Medium, 'status' => WorkOrderStatus::Planned, 'site_id' => $bumburet->id, 'created_by' => $admin->id, 'due_at' => $now->copy()->addDays(9)],
        ];
        $created = collect($orders)->map(fn ($o) => WorkOrder::create($o));

        if ($offlineAlert) {
            $offlineAlert->forceFill(['work_order_id' => $created[2]->id, 'status' => AlertStatus::Acknowledged, 'acknowledged_by' => $engineer->id, 'acknowledged_at' => $now->copy()->subHours(2)])->save();
        }

        AuditLog::create(['actor_id' => $admin->id, 'action' => 'system.seed', 'entity_type' => 'System', 'meta' => ['sites' => $sites->count(), 'assets' => $assets->count(), 'readings' => $count], 'created_at' => $now]);

        $this->command?->newLine();
        $this->command?->info('Demo accounts:');
        foreach (self::ACCOUNTS as $a) {
            $this->command?->line(sprintf('  %-9s %-24s %s', $a['role']->value, $a['email'], $a['password']));
        }
    }

    /** @return list<array<string, mixed>> */
    private function assetsFor(Site $site, string $short): array
    {
        $type = $site->type;
        // Unit count scales with plant size: a 108 MW plant has three big Francis units, a village
        // micro-hydro has one or two Pelton sets.
        $perSite = match ($type) {
            SiteType::Wind => 3,
            SiteType::Solar => 4,
            SiteType::Hydro => $site->capacity_mw >= 50 ? 3 : ($site->capacity_mw >= 1 ? 2 : 1),
        };
        $prefix = match ($type) { SiteType::Wind => 'WT', SiteType::Solar => 'INV', SiteType::Hydro => 'GEN' };
        $kind = match ($type) { SiteType::Wind => 'turbine', SiteType::Solar => 'inverter', SiteType::Hydro => 'transformer' };
        $label = match ($type) { SiteType::Wind => 'Turbine', SiteType::Solar => 'Inverter', SiteType::Hydro => 'Unit' };
        $ratedKw = round($site->capacity_mw * 1000 / $perSite);
        $siteIndex = (int) substr($site->code, -2);
        $out = [];

        for ($i = 1; $i <= $perSite; $i++) {
            // An imperfect fleet: a few degraded or offline assets create alerts and work.
            $status = OperationalStatus::Online;
            $health = 92 + (($i * 7 + $siteIndex) % 8);
            if ($site->status === OperationalStatus::Degraded && $i === 1) { $status = OperationalStatus::Degraded; $health = 64; }
            if ($site->status === OperationalStatus::Maintenance && $i === 1) { $status = OperationalStatus::Maintenance; }
            if ($site->code === 'HYD-CH-03' && $i === 2) { $status = OperationalStatus::Offline; $health = 40; }
            if ($site->code === 'SOL-CH-01' && $i === 3) { $status = OperationalStatus::Degraded; $health = 68; }

            $out[] = [
                'site_id' => $site->id,
                'name' => sprintf('%s %s %02d', $short, $label, $i),
                'tag' => sprintf('%s-%d%02d', $prefix, $siteIndex, $i),
                'kind' => $kind,
                'manufacturer' => self::MANUFACTURERS[$kind][($i + $siteIndex) % 3],
                'serial_number' => str_replace('-', '', $site->code).(1000 + $i * 37 + $siteIndex),
                'rated_kw' => $ratedKw,
                'status' => $status,
                'health_score' => $health,
                'installed_at' => $site->commissioned_at,
            ];
        }

        return $out;
    }
}
