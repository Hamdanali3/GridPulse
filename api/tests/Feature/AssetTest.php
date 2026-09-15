<?php

namespace Tests\Feature;

use App\Models\Alert;
use App\Models\Asset;
use App\Models\Site;

class AssetTest extends ApiTestCase
{
    public function test_asset_crud(): void
    {
        $this->engineer();
        $site = Site::factory()->create();

        $create = $this->postJson('/api/v1/assets', ['site_id' => $site->id, 'name' => 'Inverter 07', 'tag' => 'inv-07', 'kind' => 'inverter', 'rated_kw' => 2500, 'manufacturer' => 'SMA']);
        $create->assertCreated()->assertJsonPath('data.tag', 'INV-07')->assertJsonPath('data.site.id', $site->id)->assertJsonPath('data.health_score', 100);
        $id = $create->json('data.id');

        $this->getJson("/api/v1/assets/{$id}")->assertOk()->assertJsonPath('data.name', 'Inverter 07')->assertJsonPath('data.open_alerts', 0);
        $this->patchJson("/api/v1/assets/{$id}", ['rated_kw' => 3000, 'status' => 'degraded'])->assertOk()->assertJsonPath('data.rated_kw', 3000)->assertJsonPath('data.status', 'degraded');
        $this->getJson("/api/v1/assets?site_id={$site->id}&kind=inverter")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/assets?q=inv-07')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_asset_requires_existing_site_and_unique_tag(): void
    {
        $this->engineer();
        Asset::factory()->create(['tag' => 'WT-001']);

        $this->postJson('/api/v1/assets', ['site_id' => 999, 'name' => 'X', 'tag' => 'WT-002', 'kind' => 'turbine', 'rated_kw' => 100])
            ->assertStatus(422)->assertJsonPath('error.details.site_id.0', 'The selected site does not exist.');
        $this->postJson('/api/v1/assets', ['site_id' => Site::factory()->create()->id, 'name' => 'Dup', 'tag' => 'WT-001', 'kind' => 'turbine', 'rated_kw' => 100])
            ->assertStatus(422)->assertJsonPath('error.details.tag.0', 'That asset tag is already in use.');
    }

    public function test_bringing_asset_online_resolves_offline_alert(): void
    {
        $this->engineer();
        $asset = Asset::factory()->create(['status' => 'offline']);
        $alert = Alert::factory()->create(['asset_id' => $asset->id, 'site_id' => $asset->site_id, 'type' => 'asset_offline', 'severity' => 'critical']);

        $this->patchJson("/api/v1/assets/{$asset->id}", ['status' => 'online'])->assertOk();
        $this->assertSame('resolved', $alert->fresh()->status->value);
    }

    public function test_only_admin_deletes_assets(): void
    {
        $asset = Asset::factory()->create();
        $this->engineer();
        $this->deleteJson("/api/v1/assets/{$asset->id}")->assertStatus(403);
        $this->admin();
        $this->deleteJson("/api/v1/assets/{$asset->id}")->assertNoContent();
        $this->assertDatabaseCount('assets', 0);
    }
}
