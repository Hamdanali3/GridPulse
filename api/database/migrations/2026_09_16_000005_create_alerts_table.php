<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->foreignId('asset_id')->constrained()->cascadeOnDelete();
            $table->string('type', 24);
            $table->string('severity', 8);
            $table->string('status', 16)->default('open');
            $table->string('message', 255);
            $table->decimal('value', 10, 2)->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acknowledged_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('work_order_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'severity', 'created_at']);
            $table->index(['asset_id', 'type', 'status']);
        });

        // work_orders.alert_id was created as a plain column because alerts did not exist yet.
        Schema::table('work_orders', function (Blueprint $table) {
            $table->foreign('alert_id')->references('id')->on('alerts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('work_orders', function (Blueprint $table) {
            $table->dropForeign(['alert_id']);
        });
        Schema::dropIfExists('alerts');
    }
};
