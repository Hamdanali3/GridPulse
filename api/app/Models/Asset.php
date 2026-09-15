<?php

namespace App\Models;

use App\Enums\AssetKind;
use App\Enums\OperationalStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Asset extends Model
{
    use HasFactory;

    protected $attributes = [
        'status' => 'online',
        'health_score' => 100,
    ];

    protected $fillable = [
        'site_id', 'name', 'tag', 'kind', 'manufacturer', 'serial_number', 'rated_kw',
        'status', 'health_score', 'installed_at',
    ];

    protected function casts(): array
    {
        return [
            'kind' => AssetKind::class,
            'status' => OperationalStatus::class,
            'rated_kw' => 'float',
            'health_score' => 'float',
            'installed_at' => 'date:Y-m-d',
        ];
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function readings(): HasMany
    {
        return $this->hasMany(TelemetryReading::class);
    }

    public function latestReading(): HasOne
    {
        return $this->hasOne(TelemetryReading::class)->latestOfMany('recorded_at');
    }

    public function alerts(): HasMany
    {
        return $this->hasMany(Alert::class);
    }

    public function workOrders(): HasMany
    {
        return $this->hasMany(WorkOrder::class);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }
        $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $term).'%';

        return $query->where(fn (Builder $q) => $q
            ->where('name', 'like', $like)
            ->orWhere('tag', 'like', $like)
            ->orWhere('manufacturer', 'like', $like));
    }
}
