<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssistantLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'role',
        'surface',
        'tools_used',
        'tool_rounds',
        'latency_ms',
        'status',
        'error_code',
        'ip_hash',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'tools_used' => 'array',
            'tool_rounds' => 'integer',
            'latency_ms' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
