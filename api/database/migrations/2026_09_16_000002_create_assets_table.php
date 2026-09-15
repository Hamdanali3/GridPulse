<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('tag', 16)->unique();
            $table->string('kind', 16);
            $table->string('manufacturer', 80)->nullable();
            $table->string('serial_number', 80)->nullable();
            $table->decimal('rated_kw', 10, 2);
            $table->string('status', 16)->default('online')->index();
            $table->decimal('health_score', 5, 2)->default(100);
            $table->date('installed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assets');
    }
};
