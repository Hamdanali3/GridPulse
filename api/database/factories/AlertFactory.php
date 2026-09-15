<?php

namespace Database\Factories;

use App\Enums\AlertStatus;
use App\Enums\AlertType;
use App\Enums\Severity;
use App\Models\Asset;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<\App\Models\Alert> */
class AlertFactory extends Factory
{
    public function definition(): array
    {
        return [
            'asset_id' => Asset::factory(),
            'site_id' => fn (array $attrs) => Asset::find($attrs['asset_id'])->site_id,
            'type' => AlertType::LowEfficiency,
            'severity' => Severity::Warning,
            'status' => AlertStatus::Open,
            'message' => 'Efficiency dropped below threshold.',
            'value' => 61.5,
        ];
    }
}
