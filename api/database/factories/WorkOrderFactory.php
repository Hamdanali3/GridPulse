<?php

namespace Database\Factories;

use App\Enums\Priority;
use App\Enums\WorkOrderStatus;
use App\Models\Site;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<\App\Models\WorkOrder> */
class WorkOrderFactory extends Factory
{
    public function definition(): array
    {
        return [
            'title' => 'Inspect '.fake()->words(2, true),
            'description' => fake()->sentence(),
            'priority' => Priority::Medium,
            'status' => WorkOrderStatus::Planned,
            'site_id' => Site::factory(),
            'created_by' => User::factory(),
            'due_at' => now()->addDays(3),
        ];
    }
}
