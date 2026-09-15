<?php

namespace Tests\Feature;

use App\Models\Alert;

class AlertTest extends ApiTestCase
{
    public function test_alert_lifecycle_open_acknowledged_resolved(): void
    {
        $engineer = $this->engineer();
        $alert = Alert::factory()->create();

        $this->getJson('/api/v1/alerts?status=open')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.site.id', $alert->site_id);

        $this->postJson("/api/v1/alerts/{$alert->id}/acknowledge")->assertOk()
            ->assertJsonPath('data.status', 'acknowledged')->assertJsonPath('data.acknowledged_by.id', $engineer->id);
        $this->postJson("/api/v1/alerts/{$alert->id}/acknowledge")->assertStatus(409)->assertJsonPath('error.code', 'CONFLICT');

        $this->postJson("/api/v1/alerts/{$alert->id}/resolve")->assertOk()->assertJsonPath('data.status', 'resolved');
        $this->postJson("/api/v1/alerts/{$alert->id}/resolve")->assertStatus(409);
        $this->getJson('/api/v1/alerts?status=open')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_viewer_cannot_act_on_alerts(): void
    {
        $this->viewer();
        $alert = Alert::factory()->create();
        $this->getJson("/api/v1/alerts/{$alert->id}")->assertOk();
        $this->postJson("/api/v1/alerts/{$alert->id}/acknowledge")->assertStatus(403);
        $this->postJson("/api/v1/alerts/{$alert->id}/resolve")->assertStatus(403);
    }

    public function test_alert_converts_to_a_linked_work_order_once(): void
    {
        $this->engineer();
        $alert = Alert::factory()->create(['severity' => 'critical']);

        $res = $this->postJson("/api/v1/alerts/{$alert->id}/work-order", ['due_at' => now()->addDays(2)->toDateString()]);
        $res->assertCreated()->assertJsonPath('data.priority', 'urgent')->assertJsonPath('data.alert_id', $alert->id)->assertJsonPath('data.site_id', $alert->site_id);

        $fresh = $alert->fresh();
        $this->assertSame($res->json('data.id'), $fresh->work_order_id);
        $this->assertSame('acknowledged', $fresh->status->value);

        $this->postJson("/api/v1/alerts/{$alert->id}/work-order")->assertStatus(409);
    }

    public function test_finishing_the_work_order_resolves_the_alert(): void
    {
        $this->engineer();
        $alert = Alert::factory()->create();
        $woId = $this->postJson("/api/v1/alerts/{$alert->id}/work-order")->json('data.id');

        $this->patchJson("/api/v1/work-orders/{$woId}", ['status' => 'done'])->assertOk()->assertJsonPath('data.status', 'done');
        $this->assertSame('resolved', $alert->fresh()->status->value);
        $this->assertNotNull($this->getJson("/api/v1/work-orders/{$woId}")->json('data.completed_at'));
    }
}
