<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\Site;
use App\Models\User;
use App\Models\WorkOrder;

class WorkOrderTest extends ApiTestCase
{
    public function test_work_order_crud(): void
    {
        $admin = $this->admin();
        $site = Site::factory()->create();
        $asset = Asset::factory()->create(['site_id' => $site->id]);
        $assignee = User::factory()->engineer()->create();

        $create = $this->postJson('/api/v1/work-orders', ['title' => 'Replace gearbox oil', 'site_id' => $site->id, 'asset_id' => $asset->id, 'priority' => 'high', 'assignee_id' => $assignee->id, 'due_at' => '2030-01-01']);
        $create->assertCreated()->assertJsonPath('data.status', 'planned')->assertJsonPath('data.assignee.id', $assignee->id)->assertJsonPath('data.created_by.id', $admin->id);
        $id = $create->json('data.id');

        $this->patchJson("/api/v1/work-orders/{$id}", ['status' => 'in_progress'])->assertOk()->assertJsonPath('data.status', 'in_progress')->assertJsonPath('data.completed_at', null);
        $this->patchJson("/api/v1/work-orders/{$id}", ['status' => 'done'])->assertOk();
        $this->assertNotNull(WorkOrder::find($id)->completed_at);

        $this->getJson("/api/v1/work-orders?assignee_id={$assignee->id}")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/work-orders?status=planned')->assertOk()->assertJsonCount(0, 'data');
        $this->deleteJson("/api/v1/work-orders/{$id}")->assertNoContent();
    }

    public function test_asset_must_belong_to_the_site(): void
    {
        $this->engineer();
        $site = Site::factory()->create();
        $foreignAsset = Asset::factory()->create();

        $this->postJson('/api/v1/work-orders', ['title' => 'Mismatch', 'site_id' => $site->id, 'asset_id' => $foreignAsset->id])
            ->assertStatus(422)->assertJsonPath('error.details.asset_id.0', 'The asset must belong to the selected site.');
    }

    public function test_priority_sort_orders_by_urgency(): void
    {
        $this->viewer();
        $site = Site::factory()->create();
        foreach (['low', 'urgent', 'medium', 'high'] as $p) {
            WorkOrder::factory()->create(['site_id' => $site->id, 'priority' => $p, 'title' => "Job {$p}"]);
        }
        $titles = collect($this->getJson('/api/v1/work-orders?sort=-priority')->json('data'))->pluck('title')->all();
        $this->assertSame(['Job urgent', 'Job high', 'Job medium', 'Job low'], $titles);
    }
}
