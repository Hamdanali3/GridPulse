<?php

namespace App\Models;

use App\Enums\AlertStatus;
use App\Enums\AlertType;
use App\Enums\Severity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Alert extends Model
{
    use HasFactory;

    protected $attributes = [
        'status' => 'open',
    ];

    protected $fillable = [
        'site_id', 'asset_id', 'type', 'severity', 'status', 'message', 'value',
        'acknowledged_by', 'acknowledged_at', 'resolved_by', 'resolved_at', 'work_order_id',
    ];

    protected function casts(): array
    {
        return [
            'type' => AlertType::class,
            'severity' => Severity::class,
            'status' => AlertStatus::class,
            'value' => 'float',
            'acknowledged_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function acknowledger(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function workOrder(): BelongsTo
    {
        return $this->belongsTo(WorkOrder::class);
    }

    /** Alerts that still need attention. */
    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('status', [AlertStatus::Open->value, AlertStatus::Acknowledged->value]);
    }

    public function acknowledge(User $by): void
    {
        $this->forceFill([
            'status' => AlertStatus::Acknowledged,
            'acknowledged_by' => $by->id,
            'acknowledged_at' => now(),
        ])->save();
    }

    public function resolve(User $by): void
    {
        $this->forceFill([
            'status' => AlertStatus::Resolved,
            'resolved_by' => $by->id,
            'resolved_at' => now(),
        ])->save();
    }
}
