<?php

namespace Database\Factories;

use App\Enums\AssetKind;
use App\Enums\OperationalStatus;
use App\Models\Site;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<\App\Models\Asset> */
class AssetFactory extends Factory
{
    public function definition(): array
    {
        return [
            'site_id' => Site::factory(),
            'name' => 'Inverter '.fake()->numberBetween(1, 99),
            'tag' => sprintf('INV-%04d', fake()->unique()->numberBetween(1, 9999)),
            'kind' => AssetKind::Inverter,
            'manufacturer' => fake()->company(),
            'serial_number' => strtoupper(fake()->bothify('SN-########')),
            'rated_kw' => fake()->numberBetween(500, 5000),
            'status' => OperationalStatus::Online,
            'health_score' => fake()->numberBetween(80, 100),
        ];
    }
}
