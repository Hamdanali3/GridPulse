<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sites', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('code', 16)->unique();
            $table->string('type', 8);
            $table->decimal('capacity_mw', 8, 2);
            $table->string('status', 16)->default('online');
            $table->decimal('lat', 9, 6);
            $table->decimal('lng', 9, 6);
            $table->string('region', 80);
            $table->string('country', 80);
            $table->date('commissioned_at')->nullable();
            $table->decimal('min_efficiency', 5, 2)->default(70);
            $table->decimal('max_temperature', 5, 2)->default(65);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['type', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sites');
    }
};
