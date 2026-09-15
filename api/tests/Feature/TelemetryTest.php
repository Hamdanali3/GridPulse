<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\Site;
use App\Models\TelemetryReading;
use App\Services\TelemetrySimulator;

class TelemetryTest extends ApiTestCase
{
    public function test_simulator_tick_writes_one_reading_per_asset_and_raises_alerts(): void
    {
        $site = Site::factory()->create(['type' => 'hydro', 'status' => 'online', 'max_temperature' => 65]);
        Asset::factory()->count(3)->create(['site_id' => $site->id, 'status' => 'online']);
        Asset::factory()->create(['site_id' => $site->id, 'status' => 'offline']);

        $result = app(TelemetrySimulator::class)->tick();

        $this->assertSame(4, $result['inserted']);
        $this->assertDatabaseCount('telemetry_readings', 4);
        $this->assertDatabaseHas('alerts', ['type' => 'asset_offline', 'status' => 'open']);
        $this->assertSame(1, $result['alerts']);

        // A second tick must not duplicate the open alert.
        app(TelemetrySimulator::class)->tick();
        $this->assertDatabaseCount('alerts', 1);
    }

    public function test_fleet_live_and_series_endpoints(): void
    {
        $this->viewer();
        $site = Site::factory()->create(['type' => 'hydro', 'capacity_mw' => 10]);
        $assets = Asset::factory()->count(2)->create(['site_id' => $site->id, 'rated_kw' => 5000]);
        foreach ($assets as $asset) {
            TelemetryReading::create(['asset_id' => $asset->id, 'site_id' => $site->id, 'recorded_at' => now()->subSeconds(10), 'power_kw' => 4000, 'efficiency_pct' => 90, 'temperature_c' => 35]);
            TelemetryReading::create(['asset_id' => $asset->id, 'site_id' => $site->id, 'recorded_at' => now()->subSeconds(5), 'power_kw' => 4200, 'efficiency_pct' => 91, 'temperature_c' => 36]);
        }

        $this->getJson('/api/v1/telemetry/fleet/live')->assertOk()
            ->assertJsonPath('data.fleet_kw', 8400)->assertJsonPath('data.reporting_assets', 2)->assertJsonPath('data.capacity_kw', 10000);

        $series = $this->getJson('/api/v1/telemetry/fleet/series?minutes=10&bucket=1')->assertOk()->json('data');
        $this->assertNotEmpty($series);
        $this->assertArrayHasKey('kw', $series[0]);

        $siteSeries = $this->getJson("/api/v1/telemetry/sites/{$site->id}/series?hours=1&bucket=5")->assertOk()->json('data');
        $this->assertArrayHasKey('efficiency_pct', $siteSeries[0]);

        $this->getJson("/api/v1/telemetry/assets/{$assets[0]->id}/latest")->assertOk()->assertJsonPath('data.power_kw', 4200);
        $this->getJson('/api/v1/telemetry/fleet/series?minutes=1')->assertStatus(422);
    }

    public function test_dashboard_overview_and_csv_report(): void
    {
        $this->viewer();
        $site = Site::factory()->create(['type' => 'solar', 'capacity_mw' => 5]);
        $asset = Asset::factory()->create(['site_id' => $site->id]);
        TelemetryReading::create(['asset_id' => $asset->id, 'site_id' => $site->id, 'recorded_at' => now()->subMinutes(30), 'power_kw' => 1000, 'efficiency_pct' => 90, 'temperature_c' => 40]);
        TelemetryReading::create(['asset_id' => $asset->id, 'site_id' => $site->id, 'recorded_at' => now()->subSeconds(5), 'power_kw' => 1000, 'efficiency_pct' => 90, 'temperature_c' => 40]);

        $this->getJson('/api/v1/dashboard/overview')->assertOk()
            ->assertJsonStructure(['data' => ['fleet' => ['current_output_kw', 'capacity_kw', 'today_energy_kwh', 'availability_pct'], 'alerts' => ['open', 'recent'], 'work_orders', 'sites', 'generation_by_type', 'top_sites']])
            ->assertJsonPath('data.fleet.total_sites', 1)->assertJsonPath('data.fleet.current_output_kw', 1000);

        $csv = $this->get('/api/v1/reports/energy.csv');
        $csv->assertOk()->assertHeader('content-type', 'text/csv; charset=utf-8');
        $this->assertStringContainsString('site_code', $csv->streamedContent());
        $this->assertStringContainsString($site->code, $csv->streamedContent());
    }
}
