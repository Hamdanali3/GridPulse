<?php

namespace Tests\Feature;

use App\Models\User;

class AuthTest extends ApiTestCase
{
    public function test_first_registered_user_becomes_admin_and_later_users_are_viewers(): void
    {
        $first = $this->postJson('/api/v1/auth/register', ['name' => 'Ada Lovelace', 'email' => 'ada@example.com', 'password' => 'Secret123', 'password_confirmation' => 'Secret123']);
        $first->assertCreated()->assertJsonPath('data.user.role', 'admin')->assertJsonStructure(['data' => ['token', 'user']]);

        $second = $this->postJson('/api/v1/auth/register', ['name' => 'Grace Hopper', 'email' => 'grace@example.com', 'password' => 'Secret123', 'password_confirmation' => 'Secret123']);
        $second->assertCreated()->assertJsonPath('data.user.role', 'viewer');
    }

    public function test_registration_validates_input(): void
    {
        $this->postJson('/api/v1/auth/register', ['name' => 'A', 'email' => 'not-an-email', 'password' => 'short'])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error.code', 'VALIDATION_ERROR')
            ->assertJsonStructure(['error' => ['details' => ['name', 'email', 'password']]]);
    }

    public function test_login_returns_token_and_rejects_bad_credentials(): void
    {
        $user = User::factory()->create(['email' => 'ops@example.com']);

        $this->postJson('/api/v1/auth/login', ['email' => 'ops@example.com', 'password' => 'Password123'])
            ->assertOk()->assertJsonPath('data.user.id', $user->id)->assertJsonStructure(['data' => ['token']]);

        $this->postJson('/api/v1/auth/login', ['email' => 'ops@example.com', 'password' => 'wrong'])
            ->assertStatus(401)->assertJsonPath('error.code', 'UNAUTHENTICATED');
    }

    public function test_deactivated_user_cannot_login(): void
    {
        User::factory()->inactive()->create(['email' => 'gone@example.com']);
        $this->postJson('/api/v1/auth/login', ['email' => 'gone@example.com', 'password' => 'Password123'])->assertStatus(403);
    }

    public function test_protected_routes_require_a_token(): void
    {
        $this->getJson('/api/v1/auth/me')->assertStatus(401)->assertJsonPath('error.code', 'UNAUTHENTICATED');
        $this->getJson('/api/v1/sites')->assertStatus(401);
    }

    public function test_token_round_trip_me_update_and_logout(): void
    {
        $login = $this->postJson('/api/v1/auth/login', ['email' => User::factory()->create(['email' => 'me@example.com'])->email, 'password' => 'Password123']);
        $token = $login->json('data.token');
        $headers = ['Authorization' => "Bearer {$token}"];

        $this->getJson('/api/v1/auth/me', $headers)->assertOk()->assertJsonPath('data.email', 'me@example.com');
        $this->patchJson('/api/v1/auth/me', ['name' => 'Renamed Person'], $headers)->assertOk()->assertJsonPath('data.name', 'Renamed Person');
        $this->postJson('/api/v1/auth/logout', [], $headers)->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
        app('auth')->forgetGuards(); // the test kernel caches the resolved user between requests
        $this->getJson('/api/v1/auth/me', $headers)->assertStatus(401);
    }

    public function test_change_password_requires_current_password(): void
    {
        $this->viewer();
        $this->patchJson('/api/v1/auth/me/password', ['current_password' => 'nope', 'password' => 'NewPass123', 'password_confirmation' => 'NewPass123'])
            ->assertStatus(422)->assertJsonPath('error.details.current_password.0', 'Current password is incorrect.');
        $this->patchJson('/api/v1/auth/me/password', ['current_password' => 'Password123', 'password' => 'NewPass123', 'password_confirmation' => 'NewPass123'])
            ->assertOk();
    }
}
