<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('telemetry_readings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->timestamp('recorded_at');
            $table->decimal('power_kw', 10, 2);
            $table->decimal('efficiency_pct', 5, 2);
            $table->decimal('temperature_c', 6, 2);
            $table->decimal('irradiance_wm2', 7, 2)->nullable();
            $table->decimal('wind_speed_ms', 5, 2)->nullable();

            $table->index(['asset_id', 'recorded_at']);
            $table->index(['site_id', 'recorded_at']);
            $table->index('recorded_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telemetry_readings');
    }
};
