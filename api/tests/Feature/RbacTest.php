<?php

namespace Tests\Feature;

use App\Models\Site;
use App\Models\User;

class RbacTest extends ApiTestCase
{
    private function sitePayload(): array
    {
        return ['name' => 'Test Solar', 'code' => 'SOL-TS-01', 'type' => 'solar', 'capacity_mw' => 10, 'lat' => 1, 'lng' => 2, 'region' => 'R', 'country' => 'C'];
    }

    public function test_viewer_can_read_but_not_write(): void
    {
        $this->viewer();
        $site = Site::factory()->create();

        $this->getJson('/api/v1/sites')->assertOk();
        $this->getJson("/api/v1/sites/{$site->id}")->assertOk();
        $this->postJson('/api/v1/sites', $this->sitePayload())->assertStatus(403)->assertJsonPath('error.code', 'FORBIDDEN');
        $this->patchJson("/api/v1/sites/{$site->id}", ['name' => 'X'])->assertStatus(403);
        $this->deleteJson("/api/v1/sites/{$site->id}")->assertStatus(403);
        $this->getJson('/api/v1/users')->assertStatus(403);
    }

    public function test_engineer_can_write_but_not_delete_or_manage_users(): void
    {
        $this->engineer();
        $this->postJson('/api/v1/sites', $this->sitePayload())->assertCreated();
        $site = Site::first();
        $this->patchJson("/api/v1/sites/{$site->id}", ['name' => 'Renamed'])->assertOk()->assertJsonPath('data.name', 'Renamed');
        $this->deleteJson("/api/v1/sites/{$site->id}")->assertStatus(403);
        $this->getJson('/api/v1/users')->assertStatus(403);
        $this->getJson('/api/v1/audit')->assertStatus(403);
    }

    public function test_admin_has_full_access(): void
    {
        $this->admin();
        $this->postJson('/api/v1/sites', $this->sitePayload())->assertCreated();
        $site = Site::first();
        $this->deleteJson("/api/v1/sites/{$site->id}")->assertNoContent();
        $this->getJson('/api/v1/users')->assertOk();
        $this->getJson('/api/v1/audit')->assertOk();
    }

    public function test_admin_manages_roles_but_not_their_own(): void
    {
        $admin = $this->admin();
        $other = User::factory()->viewer()->create();

        $this->patchJson("/api/v1/users/{$other->id}", ['role' => 'engineer'])->assertOk()->assertJsonPath('data.role', 'engineer');
        $this->patchJson("/api/v1/users/{$admin->id}", ['role' => 'viewer'])->assertStatus(422);
        $this->deleteJson("/api/v1/users/{$admin->id}")->assertStatus(422);
        $this->patchJson("/api/v1/users/{$other->id}", ['is_active' => false])->assertOk()->assertJsonPath('data.is_active', false);
        $this->deleteJson("/api/v1/users/{$other->id}")->assertNoContent();
    }

    public function test_deactivated_user_is_rejected_with_existing_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;
        $user->update(['is_active' => false]);

        $this->getJson('/api/v1/sites', ['Authorization' => "Bearer {$token}"])->assertStatus(401);
    }
}
