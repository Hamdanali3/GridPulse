<?php

namespace App\Models;

use App\Enums\Priority;
use App\Enums\WorkOrderStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkOrder extends Model
{
    use HasFactory;

    protected $attributes = [
        'priority' => 'medium',
        'status' => 'planned',
    ];

    protected $fillable = [
        'title', 'description', 'priority', 'status', 'site_id', 'asset_id', 'alert_id',
        'assignee_id', 'created_by', 'due_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'priority' => Priority::class,
            'status' => WorkOrderStatus::class,
            'due_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Stamp completed_at whenever a work order reaches "done"; clear it if it is reopened.
        static::saving(function (WorkOrder $wo) {
            if ($wo->isDirty('status')) {
                $wo->completed_at = $wo->status === WorkOrderStatus::Done ? now() : null;
            }
        });
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }

    public function alert(): BelongsTo
    {
        return $this->belongsTo(Alert::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
