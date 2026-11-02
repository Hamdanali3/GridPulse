<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assistant_usage', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 24);
            $table->string('identifier', 128);
            $table->timestamp('window_start');
            $table->unsignedInteger('request_count')->default(0);

            $table->unique(['scope', 'identifier', 'window_start'], 'assistant_usage_bucket_unique');
            $table->index('window_start');
        });

        Schema::create('assistant_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('role', 16);
            $table->string('surface', 16);
            $table->json('tools_used')->nullable();
            $table->unsignedSmallInteger('tool_rounds')->default(0);
            $table->unsignedInteger('latency_ms')->default(0);
            $table->string('status', 24);
            $table->string('error_code', 64)->nullable();
            $table->string('ip_hash', 64)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('created_at');
            $table->index(['user_id', 'created_at']);
            $table->index(['surface', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assistant_logs');
        Schema::dropIfExists('assistant_usage');
    }
};
