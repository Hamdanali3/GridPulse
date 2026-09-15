<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

abstract class ApiTestCase extends TestCase
{
    use RefreshDatabase;

    protected function actingAsRole(string $role): User
    {
        $user = User::factory()->{$role}()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    protected function admin(): User
    {
        return $this->actingAsRole('admin');
    }

    protected function engineer(): User
    {
        return $this->actingAsRole('engineer');
    }

    protected function viewer(): User
    {
        return $this->actingAsRole('viewer');
    }
}
