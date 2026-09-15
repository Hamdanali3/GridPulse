<?php

namespace Database\Factories;

use App\Enums\OperationalStatus;
use App\Enums\SiteType;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<\App\Models\Site> */
class SiteFactory extends Factory
{
    public function definition(): array
    {
        $type = fake()->randomElement(SiteType::cases());
        $prefix = strtoupper(substr($type->value, 0, 3));

        return [
            'name' => fake()->city().' '.ucfirst($type->value).' Park',
            'code' => sprintf('%s-%s-%02d', $prefix, strtoupper(fake()->lexify('??')), fake()->unique()->numberBetween(1, 999)),
            'type' => $type,
            'capacity_mw' => fake()->randomFloat(1, 5, 150),
            'status' => OperationalStatus::Online,
            'lat' => fake()->latitude(),
            'lng' => fake()->longitude(),
            'region' => fake()->state(),
            'country' => fake()->country(),
            'commissioned_at' => fake()->dateTimeBetween('-8 years', '-1 year'),
            'min_efficiency' => 70,
            'max_temperature' => 65,
        ];
    }
}
