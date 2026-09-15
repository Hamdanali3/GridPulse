<?php

namespace App\Models;

use App\Enums\OperationalStatus;
use App\Enums\SiteType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Site extends Model
{
    use HasFactory;

    /** Defaults applied to new models so in-memory instances match the database schema. */
    protected $attributes = [
        'status' => 'online',
        'min_efficiency' => 70,
        'max_temperature' => 65,
    ];

    protected $fillable = [
        'name', 'code', 'type', 'capacity_mw', 'status', 'lat', 'lng', 'region', 'country',
        'commissioned_at', 'min_efficiency', 'max_temperature', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'type' => SiteType::class,
            'status' => OperationalStatus::class,
            'capacity_mw' => 'float',
            'lat' => 'float',
            'lng' => 'float',
            'min_efficiency' => 'float',
            'max_temperature' => 'float',
            'commissioned_at' => 'date:Y-m-d',
        ];
    }

    public function assets(): HasMany
    {
        return $this->hasMany(Asset::class);
    }

    public function readings(): HasMany
    {
        return $this->hasMany(TelemetryReading::class);
    }

    public function alerts(): HasMany
    {
        return $this->hasMany(Alert::class);
    }

    public function workOrders(): HasMany
    {
        return $this->hasMany(WorkOrder::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Search by name, code or region. */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (! $term) {
            return $query;
        }
        $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $term).'%';

        return $query->where(fn (Builder $q) => $q
            ->where('name', 'like', $like)
            ->orWhere('code', 'like', $like)
            ->orWhere('region', 'like', $like));
    }

    public function capacityKw(): float
    {
        return (float) $this->capacity_mw * 1000;
    }
}
