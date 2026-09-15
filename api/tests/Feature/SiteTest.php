<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\Site;

class SiteTest extends ApiTestCase
{
    public function test_create_read_update_delete_site(): void
    {
        $this->admin();

        $create = $this->postJson('/api/v1/sites', [
            'name' => 'Llano Solar', 'code' => 'sol-tx-01', 'type' => 'solar', 'capacity_mw' => 48.5,
            'lat' => 33.58, 'lng' => -101.85, 'region' => 'Texas', 'country' => 'United States', 'commissioned_at' => '2021-04-12',
        ]);
        $create->assertCreated()->assertJsonPath('data.code', 'SOL-TX-01')->assertJsonPath('data.status', 'online')->assertJsonPath('data.min_efficiency', 70);
        $id = $create->json('data.id');

        $this->getJson("/api/v1/sites/{$id}")->assertOk()->assertJsonPath('data.name', 'Llano Solar')->assertJsonPath('data.asset_count', 0);
        $this->patchJson("/api/v1/sites/{$id}", ['status' => 'degraded', 'max_temperature' => 70])->assertOk()->assertJsonPath('data.status', 'degraded')->assertJsonPath('data.max_temperature', 70);

        Asset::factory()->create(['site_id' => $id]);
        $this->deleteJson("/api/v1/sites/{$id}")->assertNoContent();
        $this->assertDatabaseCount('sites', 0);
        $this->assertDatabaseCount('assets', 0); // cascaded
        $this->getJson("/api/v1/sites/{$id}")->assertStatus(404)->assertJsonPath('error.code', 'NOT_FOUND');
    }

    public function test_site_validation_and_duplicate_code(): void
    {
        $this->engineer();
        Site::factory()->create(['code' => 'WND-IA-01']);

        $this->postJson('/api/v1/sites', ['name' => 'X', 'code' => 'bad code', 'type' => 'nuclear', 'capacity_mw' => 0, 'lat' => 200, 'lng' => 0, 'region' => '', 'country' => ''])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['details' => ['name', 'code', 'type', 'capacity_mw', 'lat', 'region', 'country']]]);

        $this->postJson('/api/v1/sites', ['name' => 'Dup', 'code' => 'WND-IA-01', 'type' => 'wind', 'capacity_mw' => 10, 'lat' => 0, 'lng' => 0, 'region' => 'R', 'country' => 'C'])
            ->assertStatus(422)->assertJsonPath('error.details.code.0', 'That site code is already in use.');
    }

    public function test_list_filters_search_and_paginates(): void
    {
        $this->viewer();
        Site::factory()->count(3)->create(['type' => 'solar']);
        Site::factory()->count(2)->create(['type' => 'wind', 'status' => 'offline']);
        Site::factory()->create(['name' => 'Needle Hydro', 'type' => 'hydro']);

        $this->getJson('/api/v1/sites?limit=4')->assertOk()->assertJsonCount(4, 'data')->assertJsonPath('meta.total', 6)->assertJsonPath('meta.pages', 2);
        $this->getJson('/api/v1/sites?type=wind')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/sites?status=offline')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/sites?q=needle')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Needle Hydro');
        $this->getJson('/api/v1/sites?type=nuclear')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_site_summary_shape(): void
    {
        $this->viewer();
        $site = Site::factory()->create(['capacity_mw' => 10]);
        Asset::factory()->count(2)->create(['site_id' => $site->id]);

        $this->getJson("/api/v1/sites/{$site->id}/summary")->assertOk()
            ->assertJsonStructure(['data' => ['current_output_kw', 'capacity_kw', 'capacity_factor_pct', 'today_energy_kwh', 'availability_pct', 'assets_by_status', 'alerts_by_severity', 'open_work_orders']])
            ->assertJsonPath('data.capacity_kw', 10000)->assertJsonPath('data.availability_pct', 100);
    }
}
